"""Daily AI, AI Video Tools, and YouTube Shorts Trend News Briefing.

Fetches recent Korean and international news via Google News RSS and Naver News,
summarizes key takeaways for beginner YouTube Shorts creators using OpenAI/Gemini,
and sends an HTML email via Gmail SMTP.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import smtplib
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT_DIR / ".env"
OUTPUT_DIR = ROOT_DIR / "outputs" / "news-briefing"
LOG_PATH = OUTPUT_DIR / "briefing.log"
DEFAULT_RECIPIENT = "poohmoon0815@gmail.com"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def log(message: str) -> None:
    """Append a timestamped log line to stdout and briefing.log."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}"
    print(line)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def load_env(path: Path) -> dict[str, str]:
    """Load key=value pairs from .env without requiring python-dotenv."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def http_get(url: str, timeout: int = 15) -> str:
    """Fetch URL content as UTF-8 text."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_google_news_rss(
    query: str, hl: str, gl: str, ceid: str, category: str, limit: int = 5
) -> list[dict[str, str]]:
    """Fetch news items from Google News RSS."""
    encoded = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl={hl}&gl={gl}&ceid={ceid}"
    items: list[dict[str, str]] = []
    try:
        xml_text = http_get(url)
        root = ET.fromstring(xml_text)
        for item in root.findall("./channel/item")[:limit]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            source_el = item.find("source")
            source = (source_el.text or "").strip() if source_el is not None else "Google News"
            if title and link:
                items.append(
                    {
                        "category": category,
                        "title": title,
                        "link": link,
                        "source": source,
                        "published": pub_date,
                    }
                )
    except Exception as exc:
        log(f"Google News RSS failed ({category}): {exc}")
    return items


def fetch_naver_news(query: str, category: str, limit: int = 4) -> list[dict[str, str]]:
    """Fetch recent Naver News search results (best-effort HTML parse)."""
    encoded = urllib.parse.quote(query)
    url = f"https://search.naver.com/search.naver?where=news&query={encoded}&sort=1"
    items: list[dict[str, str]] = []
    try:
        page = http_get(url)
        pattern = re.compile(
            r'class="news_tit"[^>]*href="([^"]+)"[^>]*title="([^"]+)"', re.IGNORECASE
        )
        seen: set[str] = set()
        for link, raw_title in pattern.findall(page):
            title = html.unescape(raw_title).strip()
            clean_link = html.unescape(link).strip()
            if title and clean_link and clean_link not in seen:
                seen.add(clean_link)
                items.append(
                    {
                        "category": category,
                        "title": title,
                        "link": clean_link,
                        "source": "Naver News",
                        "published": "",
                    }
                )
                if len(items) >= limit:
                    break
    except Exception as exc:
        log(f"Naver News fetch failed ({category}): {exc}")
    return items


def collect_articles() -> list[dict[str, str]]:
    """Collect and deduplicate articles across all target topics."""
    queries = [
        ("AI 최신 동향 (국내)", "인공지능 AI 신기술", "ko", "KR", "KR:ko", True),
        (
            "AI 영상 제작 툴",
            '"AI 영상" OR "AI 동영상" OR Sora OR Runway OR Kling OR Veo OR Higgsfield',
            "ko",
            "KR",
            "KR:ko",
            True,
        ),
        (
            "유튜브 쇼츠 트렌드",
            '"유튜브 쇼츠" OR "쇼츠 트렌드" OR "유튜브 알고리즘"',
            "ko",
            "KR",
            "KR:ko",
            True,
        ),
        (
            "AI Video Tools (해외)",
            '"AI video" OR Sora OR Runway OR Kling OR Veo OR "AI filmmaking"',
            "en-US",
            "US",
            "US:en",
            False,
        ),
        (
            "YouTube Shorts Trends (해외)",
            '"YouTube Shorts" trend OR algorithm OR creator',
            "en-US",
            "US",
            "US:en",
            False,
        ),
    ]

    all_articles: list[dict[str, str]] = []
    seen_titles: set[str] = set()

    for category, q, hl, gl, ceid, use_naver in queries:
        batch = fetch_google_news_rss(q, hl, gl, ceid, category, limit=5)
        if use_naver:
            naver_q = q.replace('"', "").split(" OR ")[0]
            batch.extend(fetch_naver_news(naver_q, category, limit=3))

        for art in batch:
            norm = re.sub(r"\s+", " ", art["title"].lower())[:50]
            if norm not in seen_titles:
                seen_titles.add(norm)
                all_articles.append(art)

    return all_articles


def summarize_with_openai(
    articles: list[dict[str, str]], api_key: str, model: str
) -> str | None:
    """Summarize collected articles into clean Korean HTML using OpenAI."""
    if not api_key:
        return None

    today_str = datetime.now().strftime("%Y년 %m월 %d일")
    article_lines = "\n".join(
        f"- [{a['category']}] {a['title']} ({a['source']}) -> {a['link']}"
        for a in articles
    )

    prompt = f"""오늘은 {today_str}입니다.
당신은 대표님(사용자)의 **'전담 AI 비서 겸 유튜브 쇼츠 멘토(선생님)'**입니다.
대표님은 현재 AI와 쇼츠 자동화 시스템을 활용해 유튜브 쇼츠 채널을 키우고 있는 크리에이터/기획자입니다.

단순히 기사를 나열하거나 요약하는 건 원치 않으십니다.
오늘 수집된 수많은 뉴스를 당신이 직접 깊이 있게 분석하여,
"대표님, 오늘 뉴스를 보니 이 부분은 꼭 챙기셔야 합니다. 앞으로 쇼츠 제작 시 이렇게 적용해 보세요!"라고
**인사이트와 구체적인 실행 가이드(액션 플랜)**를 제시하는 비서 보고서 형식으로 작성해야 합니다.

[오늘 수집된 최신 뉴스 목록]
{article_lines}

다음 구조의 세련되고 읽기 편한 HTML 본문을 작성해 주세요 (마크다운 코드블록 ```html 없이 순수 HTML만):
1. **[비서의 아침 브리핑 & 총평]**
   - 대표님께 드리는 정중하고 힘찬 아침 인사.
   - 오늘 AI/쇼츠 업계의 전반적인 흐름과 판도를 비서의 시각에서 한 문단으로 명쾌하게 짚어주기.
2. **[멘토의 핵심 코칭: 오늘 꼭 알아야 할 3가지와 쇼츠 적용법]**
   - 뉴스 속에서 대표님이 채널 운영에 바로 써먹을 수 있는 핵심 이슈 3가지 선별.
   - 각 항목마다:
     * 📌 **이 이슈가 대표님 채널에 중요한 이유** (비서의 분석)
     * 💡 **오늘 당장 쇼츠에 적용해 볼 만한 아이디어/액션 가이드** (구체적인 쇼츠 소재, 영상 툴 활용 팁, 후킹 멘트 예시 등)
3. **[앞으로의 채널 제작 방향 제안]**
   - 최신 알고리즘 변화나 AI 영상 기술 트렌드를 바탕으로 "앞으로 우리 쇼츠는 이런 톤이나 방식을 시도해 보시면 좋겠습니다"라는 선생님/전략가로서의 방향 제안.
4. **[참고용 원문 기사 리스트 (핵심 픽)]**
   - 대표님이 시간 나실 때 직접 확인해 보실 수 있도록 분야별(AI 기술, 영상 툴, 유튜브 트렌드) 알짜 기사 2~3개씩만 선별해 깔끔한 링크(`<a href="...">기사제목</a>`)로 정리.
5. 모바일/PC 모두에서 보기 편하게 카드형 디자인, 깔끔한 폰트, 눈에 잘 들어오는 하이라이트 색상(인라인 CSS)을 적용하세요."""

    payload = {
        "model": model or "gpt-4.1-mini",
        "messages": [
            {
                "role": "system",
                "content": (
                    "당신은 대표님의 든든한 전담 AI 비서이자 실전 유튜브 쇼츠 멘토입니다. "
                    "단순 요약자가 아니라, 날카로운 인사이트와 구체적인 쇼츠 제작/채널 운영 가이드를 제시하는 프로페셔널한 어조로 보고합니다."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.4,
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"].strip()
        content = re.sub(r"^```html\s*|\s*```$", "", content, flags=re.IGNORECASE)
        return content
    except Exception as exc:
        log(f"OpenAI summarization failed: {exc}")
        return None


def build_fallback_html(articles: list[dict[str, str]]) -> str:
    """Build a clean fallback HTML email if AI summarization is unavailable."""
    today_str = datetime.now().strftime("%Y년 %m월 %d일")
    rows = "".join(
        f"<li><strong>[{html.escape(a['category'])}]</strong> "
        f"<a href='{html.escape(a['link'])}'>{html.escape(a['title'])}</a> "
        f"<span style='color:#666'>({html.escape(a['source'])})</span></li>"
        for a in articles
    )
    return (
        f"<html><body style='font-family:sans-serif;line-height:1.6'>"
        f"<h2>{today_str} AI &amp; 유튜브 쇼츠 뉴스 브리핑</h2>"
        f"<p>AI 요약에 실패하여 수집된 원문 기사 목록을 전달합니다.</p>"
        f"<ul>{rows}</ul></body></html>"
    )


def send_email(
    sender: str, app_password: str, recipient: str, subject: str, html_body: str
) -> None:
    """Send an HTML email using Gmail SMTP over SSL."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipient

    plain_text = re.sub(r"<[^>]+>", " ", html_body)
    plain_text = re.sub(r"\s+", " ", plain_text).strip()
    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as server:
        server.login(sender, app_password)
        server.sendmail(sender, [recipient], msg.as_string())


def main() -> int:
    parser = argparse.ArgumentParser(description="Daily Shorts & AI News Briefing")
    parser.add_argument("--dry-run", action="store_true", help="Skip sending email")
    args = parser.parse_args()

    env = load_env(ENV_PATH)
    for k, v in env.items():
        os.environ.setdefault(k, v)

    log("Starting daily news collection...")
    articles = collect_articles()
    log(f"Collected {len(articles)} unique articles.")

    if not articles:
        log("No articles collected. Aborting.")
        return 1

    openai_key = os.environ.get("OPENAI_API_KEY", "")
    model = os.environ.get("OPENAI_ANALYSIS_MODEL", "gpt-4.1-mini")
    html_body = summarize_with_openai(articles, openai_key, model)
    if not html_body:
        html_body = build_fallback_html(articles)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    latest_html = OUTPUT_DIR / "latest_briefing.html"
    latest_html.write_text(html_body, encoding="utf-8")
    log(f"Saved briefing HTML to {latest_html}")

    if args.dry_run:
        log("Dry-run mode enabled; skipping email delivery.")
        return 0

    recipient = os.environ.get("BRIEFING_RECIPIENT", DEFAULT_RECIPIENT)
    sender = os.environ.get("GMAIL_SENDER", recipient)
    app_password = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")

    if not app_password:
        log(
            "GMAIL_APP_PASSWORD is not set in .env. "
            "Add GMAIL_APP_PASSWORD=<16-char app password> to send emails."
        )
        return 2

    today_str = datetime.now().strftime("%m/%d")
    subject = f"[아침 브리핑 {today_str}] AI · 영상 제작 툴 · 유튜브 쇼츠 트렌드"
    send_email(sender, app_password, recipient, subject, html_body)
    log(f"Successfully sent briefing email to {recipient}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
