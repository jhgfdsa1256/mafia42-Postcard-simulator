# 마피아42 엽서 플래너

우체통을 효율적으로 운영하기 위한 정적 웹 계산기입니다. 서버 없이 브라우저에서 모두 계산하고, 입력값은 브라우저(localStorage)에 닉네임별로 자동 저장됩니다.

## 폴더

```
index.html            화면
css/style.css         스타일
js/engine.js          계산 엔진 (화면과 무관, Node에서도 동작)
js/view.js            결과 화면 HTML 생성 (순수 함수)
js/app.js             입력 연결, 자동 저장, 닉네임 불러오기
js/storage.js         localStorage 래퍼
js/profile.js         닉네임 → 우체통 정보 어댑터
js/config.js          배포 설정 (profileApi 주소)
data/cards.json       엽서 데이터 (크롤러가 채우는 파일)
data/cards.example-event.json   이벤트·마이너스 엽서 형식 예시
img/                  엽서 이미지 (파일명은 cards.json의 image와 맞추세요)
test/engine.test.mjs  엔진 테스트
```

## 배포 (GitHub Pages)

1. 이 폴더를 저장소에 올립니다.
2. Settings → Pages → Branch를 `main` / `(root)`로 지정합니다.
3. 발급된 주소로 열면 됩니다.

로컬에서 확인할 때는 폴더에서 `python3 -m http.server` 를 실행하고 `http://localhost:8000` 으로 엽니다. `index.html`을 더블클릭하면 브라우저가 `data/cards.json` 읽기를 막습니다.

## 엽서 데이터 형식 (`data/cards.json`)

```json
{
  "id": "dice",
  "name": "주사위엽서",
  "image": "img/dice.webp",
  "source": "shop",
  "price": { "currency": "루나", "amount": 50 },
  "fame": { "type": "table", "values": [[1, 8.22], [2, 8.33]] },
  "days": { "type": "uniform", "min": 1, "max": 40 }
}
```

| 필드 | 설명 |
|---|---|
| `id` | 고유 영문 이름. 저장된 사용자 데이터가 이 값을 가리키므로 바꾸지 마세요. |
| `source` | `shop`(상점) 또는 `event`(이벤트). |
| `price` | `{currency: "루블"\|"루나", amount}`. 이벤트 엽서처럼 살 수 없으면 `null`. `source`가 `event`이면 가격이 있어도 구매 대상에서 빠집니다. |
| `fame` | `{type:"fixed", value}`, `{type:"uniform", min, max}`, `{type:"table", values:[[명성, 확률%], ...]}`. **마이너스 엽서는 음수로 적습니다.** 확률 합은 100이 아니어도 자동으로 정규화됩니다. |
| `days` | `{type:"fixed", value}`, `{type:"uniform", min, max}`, `{type:"table", values:[[일수, 확률%], ...]}`. |

이벤트·마이너스 엽서 예시는 `data/cards.example-event.json`에 있습니다. 실제 엽서가 아니므로 쓰지 마세요.

## 계산 규칙

- 명성은 우체통 안 모든 엽서의 합입니다. 마이너스 엽서는 합에서 빠집니다.
- 합이 0 이상이면 명성 1당 하루 100루블 × (1 + 길드 버프 + 유명세), 합이 마이너스면 버프 없이 명성 1당 −100루블입니다. (이 부분은 게임에서 확인된 값이 아니라 가정입니다. `js/engine.js`의 `income`에서 바꿀 수 있습니다.)
- 루나는 하루 `max(0, ⌊전체 명성 ÷ 42⌋)`개입니다.
- 우체통은 42칸에서 시작하고, n단계로 올리는 데 n만 루블이 들며 한 단계에 10칸이 늘어납니다.
- 엽서는 지속 일수가 끝나야 사라집니다. 마이너스 엽서는 칸을 차지하고 명성을 깎으며, "회수 요청 우선순위"는 지금 없앨 수 있다면 얼마나 이득인지를 보여 줍니다.
- 경매장(루나→루블 환산)은 없습니다.
- 확률 엽서는 기대값으로 계산하므로 실제 결과는 운에 따라 달라집니다.

## 닉네임 불러오기

닉네임을 입력하면 먼저 브라우저에 저장된 정보를 찾습니다. 저장된 게 없으면 `js/config.js`의 `profileApi`로 조회합니다. 비워 두면 조회는 건너뜁니다.

`profileApi`는 `?nick=닉네임` 요청에 아래 JSON을 돌려주면 됩니다. 브라우저에서 다른 사이트를 직접 부르면 CORS에 막히는 경우가 많아서, 보통은 직접 만든 작은 중계 서버(Cloudflare Workers 등)를 거쳐야 합니다.

```json
{
  "step": 3,
  "rub": 120000,
  "luna": 15,
  "holdings": [
    { "id": "normal", "count": 40, "remain": 12 },
    { "name": "(마이너스 엽서 이름)", "count": 5, "remain": 3 }
  ]
}
```

`holdings`는 `id`로 찾고, 없으면 `name`으로 찾습니다. 둘 다 `cards.json`에 없는 엽서는 건너뜁니다.

## 테스트

```
node test/engine.test.mjs
```

## 라이선스 참고

나무위키 본문은 CC BY-NC-SA 라이선스입니다. 수치만 가져오고 출처를 표시하는 비상업 운영을 전제로 했습니다.
