# SOW Wave Editor

타워 디펜스 게임 SOW(XSBD2)의 언리얼 DataTable 웨이브 데이터를 시각적으로 편집하고 JSON으로 내보내는 단일 페이지 도구. GitHub Pages에 그대로 호스팅 가능한 정적 파일 묶음.

[SOW Grid Editor](../SOW-Grid-Editor)의 자매 프로젝트이며 동일한 톤·스택·UX를 따른다.

## 빠른 시작

1. 브라우저에서 `index.html`을 연다 (또는 GitHub Pages URL).
2. 첫 실행 시 `Forest` 테마 + `Forest_Stage1/2/3` 시드와 매핑이 자동 로드된다.
3. 좌측 상단 드롭다운에서 테마를 선택, 그 아래 목록에서 스테이지를 선택.
4. 우측에서 Wave / MonsterSpawnData를 편집.
5. `[이 스테이지 JSON]`으로 단일 스테이지를 export → `.json`을 언리얼 DataTable에 reimport.

## 데이터 계층

```
themes[]                  ← 테마 (Forest, Iceland, …)
├── settings              ← MonsterType / BehaviorTree 매핑 (테마별)
└── stages[]              ← 스테이지 (Forest_Stage1, Forest_Stage2, …)
    └── waves[]           ← F_Wave row
        └── monsters[]    ← F_MonsterSpawnData entry
```

테마는 별개의 적 인벤토리(=Settings)를 가진다. Forest 테마에 등록된 BabyYeti가 Iceland 테마에는 없을 수 있다. 테마를 바꾸면 Settings 모달과 드롭다운 옵션이 바뀐다.

## 주요 기능

- **테마 관리**: 좌측 상단 드롭다운으로 테마 전환. [+ 새] / [복제] / [이름] / [삭제] 버튼으로 관리. 테마 삭제 시 포함된 모든 스테이지·매핑이 함께 삭제됨.
- **스테이지 관리**: 좌측 목록에서 선택. 추가/복제/삭제/이름 변경. 스테이지 이름이 export 파일명이 됨.
- **Wave 편집**: Wave 추가/삽입/복제/삭제, 드래그앤드롭으로 순서 재배치. `WaveNum`/`Name`은 배열 인덱스에서 자동 도출.
- **MonsterSpawnData 편집**: Wave 안에서 그룹 추가/삭제/순서변경. `MonsterType`/`BehaviorTree`는 현재 테마의 Settings에 등록된 항목만 드롭다운에 노출.
- **Settings (테마별)**: MonsterType / BehaviorTree 매핑 표 편집. 표시 이름은 UI 식별자, 내부 경로는 export 시 자동 래핑됨.
- **자동 저장**: 편집 시마다 500ms 디바운스로 localStorage에 영속화.
- **Export**:
  - 스테이지별 JSON (UE F_Wave 포맷 1:1)
  - 전체 스테이지 일괄 export — 현재 테마의 모든 스테이지를 각각 JSON으로 (각 파일 사이 150ms 간격)
  - 백업 export — 모든 테마+스테이지+설정을 한 파일로
- **Import**:
  - **스테이지 JSON 가져오기**: F_Wave 형식 JSON 여러 개를 현재 테마로 추가. 파일명이 스테이지 이름이 되며 중복 시 `_2` 자동 부여. 처음 보는 MonsterType/BehaviorTree 경로는 BP 클래스 이름으로 현재 테마의 Settings에 자동 등록.
  - **백업 가져오기**: 백업 JSON으로 전체 데이터 덮어쓰기 (확인 모달). schemaVersion 1(레거시 단일 settings)과 2(테마 기반) 모두 지원.
- **단축키**: `Ctrl+S` 즉시 저장, `Ctrl+N` 새 Wave, `Ctrl+D` (포커스된 Wave) 복제.

## 파일 구조

```
SOW-Wave-Editor/
├── index.html        ← 진입점
├── app.js            ← 메인 로직
├── style.css         ← 스타일
├── README.md
└── .nojekyll         ← GitHub Pages용
```

빌드 단계 없음. Push만 하면 GitHub Pages가 그대로 호스팅.

## F_Wave 구조 (export 시)

```jsonc
{
  "Name": "1",                    // 자동 = String(idx + 1)
  "WaveNum": 1,                   // 자동 = idx + 1
  "MonsterSpawnData": [
    {
      "MonsterType": "/Script/Engine.BlueprintGeneratedClass'<inner_path>'",
      "MonsterCount": 30,
      "SpawnTime": 1,
      "SpawnInterval": 1,
      "SpawnPointIndices": [0],
      "BehaviorTree": "None"      // 또는 "/Script/AIModule.BehaviorTree'<inner_path>'"
    }
  ],
  "WaveDuration": 0,
  "PreInterludeTime": 15,
  "WaveReward": 10
}
```

## 경로 래핑 규칙

Settings에는 **공통 prefix `/Game/01Blueprints/Enemy/` 아래의 짧은 경로만** 입력한다:
- MonsterType: `EnemyTypes/.../BP_Enemy_X.BP_Enemy_X_C`
- BehaviorTree: `AI/BT_X.BT_X`

Export 시 도구가 자동으로 공통 prefix와 엔진 래퍼를 씌운다:
- MT: `/Script/Engine.BlueprintGeneratedClass'/Game/01Blueprints/Enemy/<short>'`
- BT: `/Script/AIModule.BehaviorTree'/Game/01Blueprints/Enemy/<short>'`
- BT가 비어있으면 문자열 `"None"`으로 출력

**탈출구**: 입력값이 `/`로 시작하면 공통 prefix를 prepend하지 않고 그대로 사용 (`/Game/01Blueprints/Enemy/` 밖의 에셋용).

백업 가져오기 / Backup Import 시 역방향(엔진 래퍼 제거 + 공통 prefix 제거)도 지원하므로 round-trip이 무손실이다.

## localStorage 키

| 키 | 내용 |
|---|---|
| `sow_wave_themes`        | 모든 테마 — 각 테마는 settings + stages를 포함 |
| `sow_wave_current_theme` | 마지막으로 선택한 테마 ID |
| `sow_wave_current_stage` | 마지막으로 선택한 스테이지 ID |

레거시 키(`sow_wave_levels`, `sow_wave_settings`, `sow_wave_current`)는 첫 로드 시 자동으로 단일 `Forest` 테마로 마이그레이션되고 삭제된다.

## 검증 정책 (의도적 약함)

- MonsterType 미선택 → UI에서 `이름없는 적N`으로 표시. Export는 빈 경로로 진행되며 콘솔 경고만 출력.
- 매핑 안 된 표시 이름 → 드롭다운에 `(미등록)`으로 표시. Export는 빈 경로 + 콘솔 경고.
- 음수, 0, 빈 배열 등 모든 숫자/배열 입력 허용.
- 빨간 줄·차단 모달 같은 방해 요소 없음.

## 백업 포맷 (schemaVersion 2)

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-05-07T...",
  "themes": [
    {
      "id": "...",
      "name": "Forest",
      "settings": {
        "monsterTypeMap": [{ "name": "BabyYeti", "path": "EnemyTypes/.../BP_Enemy_BabyYeti.BP_Enemy_BabyYeti_C" }],
        "behaviorTreeMap": [{ "name": "Default", "path": "AI/BT_EnemyBase.BT_EnemyBase" }]
      },
      "stages": [
        { "id": "...", "name": "Forest_Stage1", "waves": [ ... ] }
      ]
    }
  ]
}
```

schemaVersion 1 백업(이전 형식: 단일 `settings` + 평면 `levels`)을 가져오면 자동으로 단일 `Forest` 테마로 래핑된다.

## 기술 세부사항

- **프레임워크 없음**: 순수 바닐라 JavaScript / CSS / HTML.
- **빌드 단계 없음**: 정적 파일을 그대로 호스팅.
- **드래그앤드롭**: HTML5 Drag and Drop API. ⠿ 핸들에서만 시작.
- **드롭존 표시**: 위/아래 절반 기준으로 `drop-above` / `drop-below` 마커 토글.
- **Export 형식**: `JSON.stringify(rows, null, "\t")` — 샘플 DT 파일과 1:1 일치.

## 브라우저 호환성

ES6 / CSS Flexbox / localStorage / HTML5 DnD를 지원하는 모든 모던 브라우저. Chrome / Edge / Firefox / Safari에서 동작.

---

**버전**: 1.1
**언어**: 한국어 UI (기술 용어 영어 유지)
