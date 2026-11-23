import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

# Load env
lines = Path('c:/shorts-v2/.env').read_text(encoding='utf-8').splitlines()
env = {}
for l in lines:
    if '=' in l and not l.strip().startswith('#'):
        k, v = l.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

sender = env.get('GMAIL_SENDER', 'poohmoon0815@gmail.com')
app_pwd = env.get('GMAIL_APP_PASSWORD', '').replace(' ', '')
recipient = 'poohmoon0815@gmail.com'

subject = '[비서&멘토 특별 분석 보고서] 제작 완료된 쇼츠 10편 정밀 분석 및 향후 채널 성장 전략 제안'

html_body = '''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; line-height: 1.6; color: #2d3748; background-color: #f7fafc; margin: 0; padding: 20px; }
  .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
  .header { background: linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%); color: white; padding: 30px 25px; text-align: left; }
  .header h1 { margin: 0 0 10px 0; font-size: 22px; }
  .header p { margin: 0; font-size: 14px; opacity: 0.9; }
  .content { padding: 25px; }
  .card { background: #f8fafc; border-left: 4px solid #3182ce; padding: 18px 20px; border-radius: 6px; margin-bottom: 22px; }
  .card.alert { border-left-color: #dd6b20; background: #fffaf0; }
  .card.success { border-left-color: #38a169; background: #f0fff4; }
  .card-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; color: #2c5282; }
  ul { margin: 8px 0; padding-left: 20px; }
  li { margin-bottom: 6px; font-size: 14px; }
  .highlight { font-weight: bold; color: #c53030; }
  .strategy-box { background: #edf2f7; border-radius: 8px; padding: 15px; margin-top: 10px; font-size: 14px; }
  .footer { background: #edf2f7; padding: 15px 25px; text-align: center; font-size: 12px; color: #718096; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <p>👤 <strong>대표님 전담 AI 비서 &amp; 쇼츠 총괄 디렉터 보고</strong></p>
    <h1>완성 영상 10편 정밀 진단 및 채널 방향성 전략</h1>
    <p>현재까지 대시보드를 통해 완성된 10편(1차 5편 + 2차 5편)을 면밀히 분석한 결과입니다.</p>
  </div>
  
  <div class="content">
    <div class="card">
      <div class="card-title">🔍 1. 기존 제작 영상 10편 데이터 진단</div>
      <p style="font-size: 14px; margin-bottom: 12px;">대시보드에서 기획방향 선정 &rarr; 대본 초안(DRAFT_A) 확정 &rarr; 음성(TTS) &rarr; 나노바나나 클레이 이미지 매칭으로 완성된 10편의 주제 분류 결과입니다:</p>
      <ul>
        <li><strong>[1차 5편 - 일상/심리/소통 계열]</strong>: 커피와 감정 변화, 군대 말투(다나까), 목소리 크기와 긴장감 심리, 말투와 신뢰도 등</li>
        <li><strong>[2차 5편 - 과학/우주/호기심 계열]</strong>: 시뮬레이션 우주론(일론 머스크), 중력의 비밀, 스트레스와 300만 개 신체 반응, 365.2422일 역법의 신비, 5분 아침 루틴 등</li>
      </ul>
      <p style="font-size: 13px; color: #4a5568; margin-top: 10px;">💡 <strong>비서의 총평</strong>: 1차는 '대화법/심리', 2차는 '과학/미스터리 지식'으로 스펙트럼이 다소 분산되어 있었습니다. 이제 유튜브 알고리즘이 채널의 성격을 한눈에 파악할 수 있도록 <strong>'알고리즘 페르소나(타겟 시청층)'</strong>를 명확히 좁혀줄 타이밍입니다.</p>
    </div>

    <div class="card success">
      <div class="card-title">🎯 2. '호기심빛나' 채널이 가야 할 가장 강력한 방향</div>
      <p style="font-size: 14px;"><strong>결론부터 말씀드리면: <span class="highlight">'2차 5편(과학·인체·호기심 지식 탐구)'</span> 계열로 100% 집중하셔야 합니다!</strong></p>
      <ul>
        <li><strong>비주얼 싱크로율 최고</strong>: 현재 사용 중인 <em>'아기자기한 클레이(점토) 3D 캐릭터'</em> 비주얼은 군대 말투나 일반 소통법보다, <strong>'거대한 우주, 신비한 인체, 신기한 과학 원리를 작고 귀여운 캐릭터가 탐험하는 컨셉'</strong>과 폭발적인 시너지를 냅니다.</li>
        <li><strong>시청 지속시간(Retention) 극대화</strong>: <em>'지구가 시속 10만km로 도는데 왜 안 어지러울까?', '스트레스 받으면 몸속 세포 300만 개가 하는 일'</em>처럼 숫자가 명확하고 호기심을 자극하는 과학 지식이 쇼츠 3초 이탈률을 막는 가장 강력한 무기입니다.</li>
        <li><strong>채널 슬로건 제안</strong>: <strong>「세상의 모든 경이로운 비밀을 1분 만에 밝히는 호기심빛나」</strong></li>
      </ul>
    </div>

    <div class="card alert">
      <div class="card-title">🚀 3. [오늘의 추천] 대시보드에서 당장 만들어야 할 쇼츠 주제 3선</div>
      <p style="font-size: 14px; margin-bottom: 10px;">대표님, 오늘 대시보드에서 새로운 5편을 기획하실 때 아래 3가지 키워드/후킹 구조를 입력해 보시는 것을 강력 추천합니다:</p>
      
      <div class="strategy-box" style="margin-bottom: 10px;">
        <strong>1) 🌌 우주 호기심</strong>: <em>'달이 지구에서 1년에 3.8cm씩 멀어지면 생기는 끔찍한 일'</em><br>
        <span style="color: #4a5568;">- 후킹 멘트: "만약 오늘 밤 달이 하늘에서 사라진다면, 지구는 몇 시간 만에 멸망할까요?"</span><br>
        <span style="color: #2b6cb0; font-size: 12px;">&rarr; 클레이 우주인 캐릭터가 달을 망원경으로 보며 깜짝 놀라는 씬 연출</span>
      </div>

      <div class="strategy-box" style="margin-bottom: 10px;">
        <strong>2) 🧬 인체 미스터리</strong>: <em>'우리가 밤에 잠잘 때 뇌가 쓰레기를 청소하는 소름 돋는 과정'</em><br>
        <span style="color: #4a5568;">- 후킹 멘트: "매일 밤 당신이 잠들면, 뇌 속에서는 물청소 트럭 수천 대가 출동합니다!"</span><br>
        <span style="color: #2b6cb0; font-size: 12px;">&rarr; 뇌 속 글림프 시스템을 빗자루 든 귀여운 클레이 캐릭터들로 시각화</span>
      </div>

      <div class="strategy-box">
        <strong>3) ⏱️ 시간/스케일 착시</strong>: <em>'공룡이 살던 시대와 스마트폰 시대, 어느 쪽이 더 가까울까?'</em><br>
        <span style="color: #4a5568;">- 후킹 멘트: "티라노사우루스는 스테고사우루스보다 아이폰을 든 우리와 더 가까운 시대에 살았습니다!"</span><br>
        <span style="color: #2b6cb0; font-size: 12px;">&rarr; 상식을 뒤엎는 반전 숫자 지식 (댓글 토론 유도 100%)</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📅 4. 오늘 유튜브 순차 업로드 실행 계획</div>
      <ul>
        <li>오늘부터 유튜브 업로드 제한이 풀리는 대로, 보관 중인 10편 중 <strong>'일론 머스크의 현실 확률' 편</strong>과 <strong>'중력 실험' 편</strong>처럼 호기심 자극 지수가 가장 높은 영상부터 우선 배치하여 예약(매일 오후 6시)을 걸겠습니다.</li>
        <li>대표님은 PC에서 대시보드 1~3단계(주제 설정)만 편하게 진행해 주시면, 나머지 대본 팩트체크부터 영상 렌더링, 예약 업로드까지 제가 비서로서 완벽히 서포트하겠습니다.</li>
      </ul>
    </div>
  </div>

  <div class="footer">
    보고자: 전담 AI 비서 &amp; 쇼츠 디렉터 | 채널 성공을 위해 매일 연구하고 서포트하겠습니다.
  </div>
</div>
</body>
</html>
'''

msg = MIMEMultipart('alternative')
msg['Subject'] = subject
msg['From'] = sender
msg['To'] = recipient
msg.attach(MIMEText(html_body, 'html', 'utf-8'))

with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as server:
    server.login(sender, app_pwd)
    server.sendmail(sender, [recipient], msg.as_string())

print('ANALYSIS_EMAIL_SENT_SUCCESS')
