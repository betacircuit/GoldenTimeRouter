# Golden Time Router

태블릿에서 환자 상태를 자연어로 입력하고 주변 응급의료기관, 자동차 이동 시간, 모델 응답을 확인하는 React·TypeScript 앱입니다.

## 실행

Node.js 22.12 이상에서:

```sh
npm ci
npm run dev
```

http://127.0.0.1:5173 에서 엽니다. `.env.example`을 `.env.local`로 복사해 키를 입력합니다. Windows의 `start.cmd`는 프로젝트에 설치된 Node가 있으면 이를 사용합니다.

## 환경변수

| 변수 | 값 / 용도 |
| --- | --- |
| `VITE_DATA_MODE` | `server`: 공개 병원 수집본 + 실제 ETA, `demo`: 가상 시나리오, `live`: 팀 추천 API |
| `VITE_API_BASE_URL` | 팀 추천 API 주소. 기본 `/api` |
| `VITE_KAKAO_MAP_APP_KEY` | 카카오 JavaScript 키. 로컬/배포 도메인 등록 필요 |
| `KAKAO_REST_API_KEY` | 서버 전용 카카오모빌리티 길찾기 키 |
| `GROQ_API_KEY` | 서버 전용 Groq 키. 설정 시 OpenRouter보다 우선 |
| `GROQ_MODEL` | `openai/gpt-oss-120b` |
| `OPENROUTER_API_KEY` | Groq 미설정 시 사용할 대체 제공자 키 |
| `OPENROUTER_MODEL` | `qwen/qwen3.8-27b:free` |
| `API_PROXY_TARGET` | 로컬에서 팀 추천 API를 연결할 때만 사용 |

Groq 키: https://console.groq.com/keys · Kakao 키: https://developers.kakao.com/console/app
서버 키에는 `VITE_` 접두사를 붙이지 않습니다. `.env.local`은 커밋하지 않습니다.

## 화면

- 자연어 입력 → 병원 찾기 한 번으로 추출과 검색. 환자 입력란 아래에 3×3 병원 카드, 오른쪽에 지도를 함께 표시합니다.
- 추출 중 경과 시간과 실제 처리 단계, 취소 기능을 제공합니다.
- 환자 입력이나 현재 위치가 바뀌면 이전 결과를 비우고 다시 검색합니다. 없는 환자 정보와 예측 수치는 임의로 채우지 않습니다.
- 현재 위치 자동 확인과 재요청. 주소 검색·정보 확인·예시 입력 버튼은 제거했습니다.
- 지도는 출발지 10 km 근방에서 시작하고, 가까운 병원이 모여 있으면 확대하며 확률 상위 3곳이 멀면 축소합니다.
- 4:3 아이패드 화면에 맞춘 흰색 카드에 상위 3곳을 파란색으로 강조합니다. 병원 목록은 3열로 아래로 드래그·스크롤할 수 있습니다. 모바일에서는 지도와 목록을 세로로 배치합니다.
- 지도에는 모든 후보 이름을 표시하고, 겹치는 이름은 실제 좌표와 연결선으로 연결해 배치합니다.
- 결과 화면 상단 바는 ‘메뉴’ 버튼으로 펼칩니다. ‘처음 화면’으로 나가면 환자 입력과 결과를 초기화합니다.
- ‘전화’ 버튼은 번호와 간단한 추천 이유를 담은 카드로 이동합니다. 자동으로 전화를 걸지 않습니다. 닫으면 선택·스크롤 위치가 유지됩니다.
- Demo 메뉴에서 5가지 환자 유형, 출발 위치, 7가지 응답 시나리오, 병원별 시간·확률을 설정하고 바로 결과로 이동합니다. 데모 설정은 URL에 반영되어 새로고침해도 복원됩니다.

`server` 모드는 공개 NEMC/HIRA 수집본을 읽고 가까운 최대 10곳의 실제 자동차 ETA를 조회합니다. 환자별 확률 API는 `live` 어댑터로 연결하며, 미연결 시 확률을 만들지 않습니다. Demo의 병원·예측·전화번호는 시연용 가상 값입니다. 실제 환자 입력은 URL에 넣지 않습니다.

## 배포

Vercel에서 이 저장소를 Vite 프로젝트로 가져오고 위 환경변수를 등록합니다. `vercel.json`과 `api/service.ts`가 자연어 추출과 길찾기를 서버 함수로 연결합니다. 키를 클라이언트로 전달하지 않습니다. 배포 도메인을 카카오 JavaScript SDK 허용 도메인에 추가합니다.

`public/server-catalog.json`은 공개 기관·자원 수집본입니다. `public/data-insights.json`은 집계치만 포함합니다. 환자 원본, 개인별 자료와 내부 서버 접근 정보는 저장소에 포함하지 않습니다.

## 검증

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

브라우저 테스트는 별도 포트 5174–5176에서 모의 제공자 응답으로 실행됩니다.
