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

- 자연어 입력 → 병원 찾기 한 번으로 추출과 검색. 필요할 때만 정보 확인에서 수정합니다.
- 추출 중 경과 시간과 실제 처리 단계, 취소 기능을 제공합니다.
- 숫자는 터치 스크롤 휠로 수정합니다. 환자 정보가 없으면 정상값을 임의로 채우지 않습니다.
- 현재 위치 자동 등록, 주소 검색, 확대된 지도와 탭 조작.
- 가로 화면은 병원 카드와 지도 동시 표시. 작은 화면은 목록/지도 탭. 후보는 이전·다음 버튼으로 넘깁니다.
- 상세에서 돌아오면 페이지·정렬·선택을 유지합니다.
- Demo 메뉴: 10곳, 3곳, 0곳, 일부 정보 누락, API 오류.

`server` 모드는 공개 NEMC/HIRA 수집본을 읽고 가까운 최대 10곳의 실제 자동차 ETA를 조회합니다. 환자별 확률 API는 `live` 어댑터로 연결하며, 미연결 시 확률을 만들지 않습니다. Demo의 가상 병원·모델 수치는 고정 예시이며 전화 연결은 비활성화됩니다. 자원 관측 시각과 보유 시설은 실제 현재 수용 여부와 별도로 표시됩니다.

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