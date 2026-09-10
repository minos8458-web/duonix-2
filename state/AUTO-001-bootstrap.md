# AUTO-001 Bootstrap State

- Branch: `automation/auto-001-bootstrap`
- Required starting SHA: `1d3ffb177f413c65cd98fbf1f73d14a33b0121b8`
- Scope: deterministic local smoke validation only
- Validation command: `node scripts/validate-smoke.js`
- Correction: MIME-like text is excluded only for static literals and CSS `url()` values; ordinary repository paths remain checkable.
- Validation result: PASS (2026-09-11; 30 local static references checked)
- Exit code: `0`
- Network: no external network access required
- Missing-reference regression: `node scripts/validate-smoke.js ..\auto-001-missing-reference-fixture` returned FAIL with exit code `1` and identified `assets\missing.png`.
- Missing-entry regression: `node scripts/validate-smoke.js ..\auto-001-missing-duonix-fixture` returned FAIL with exit code `1` and identified missing `duonix.html`.
- Control Tower disposition: Correction 1 independently reviewed; one feature-branch commit/push is authorized. PR and `main` changes are not authorized.
- Model routing policy approval: `APPROVED — GPT-5.3-Codex-Spark active utilization for DUONIX development automation`
- Policy approval boundary: 모델 사용 정책 승인만 의미하며 개별 기능 구현, architecture 변경, PR 생성, `main` merge 승인으로 확대하지 않는다.
- AUTO-001 final completion: NOT YET APPROVED; genuine fresh-checkout Validation은 현재 Control Tower disposition에 따라 여전히 필요하다.
- Next resume point: 독립 Validation 환경에서 exact feature-branch HEAD를 genuine fresh checkout으로 검증한다. Control Tower disposition 전에는 AUTO-002 또는 신규 게임 기능 작업을 시작하지 않는다.

---

# DUONIX AI MODEL ROUTING POLICY

Status: USER APPROVED / CONTROL TOWER RECORDED
Recorded: 2026-09-11
Applies to: DUONIX development automation from AUTO-001

## 기본 원칙

AI 모델은 가격순으로 무조건 사용하는 것이 아니라 **작업 난도와 작업 형태에 따라 가장 저렴하게 성공할 가능성이 높은 모델을 선택한다.**

프로젝트 상태의 최종 근거는 채팅 기억이 아니다.

우선순위는 다음과 같다.

1. GitHub `main` 및 해당 작업 브랜치의 실제 HEAD
2. 최신 공식 HANDOFF 또는 상태 문서
3. Validation/Test 증거
4. 승인된 Decision/Architecture 문서

서로 충돌하면 추정하지 말고 `미확인`으로 처리한다.

## 1. GPT-5.3-Codex-Spark 적극 활용

`GPT-5.3-Codex-Spark`의 별도 사용 한도를 DUONIX의 개발 자원으로 적극 활용한다.

Spark는 다음처럼 범위가 명확하고 피드백 루프가 짧은 작업의 **제1 후보 모델**이다.

- 저장소 탐색
- 특정 파일 분석
- 작은 기능 구현
- 국소적인 코드 수정
- 명확한 버그 수정
- 테스트 코드 추가
- smoke validation 작성
- lint / validation 오류 수정
- 반복적인 코드 정리
- 경미한 문서-코드 동기화
- 작은 Git diff 분석
- 실패 원인이 명확한 재수정

단, Spark 사용 가능 여부와 실제 실행 환경은 매 작업 시작 시 확인한다.
사용할 수 없으면 이를 모델 실패로 기록하지 않는다.

## 2. Luna의 역할

`GPT-5.6 Luna`는 DUONIX의 **저비용 다단계 자율 작업 기본 모델**이다.

다음과 같은 작업은 처음부터 Luna가 더 적합할 수 있다.

- 여러 파일에 걸친 구현
- 구현 → 실행 → 분석 → 수정 → 재검증이 여러 차례 필요한 작업
- 비교적 긴 autonomous coding loop
- Spark가 처리하기에는 작업 문맥이 큰 경우
- 작은 하위 작업 여러 개를 하나의 완료 조건까지 연결해야 하는 경우

따라서 모델 라우팅은 다음처럼 해석한다.

`짧고 명확한 국소 작업`
→ Spark 우선

`여러 단계가 연결된 저비용 자율 작업`
→ Luna 우선

## 3. 상위 모델 승급

필요할 경우에만 다음 단계로 승급한다.

`Spark / Luna`
→ `GPT-5.6 Terra`
→ `GPT-5.6 Sol 이상`

상위 모델 사용은 단순 실패만으로 자동 결정하지 않는다.

먼저 실패 원인을 다음 중 하나로 분류한다.

- `MODEL_CAPABILITY`
- `TASK_SCOPE`
- `TOOL_FAILURE`
- `ENVIRONMENT_FAILURE`
- `PERMISSION_FAILURE`
- `REQUIREMENT_AMBIGUITY`
- `USAGE_LIMIT`
- `UNKNOWN`

`MODEL_CAPABILITY`로 판단할 객관적 근거가 있을 때만 모델 승급을 검토한다.

중요한 아키텍처 변경이나 고비용 모델 사용이 필요한 경우에는 자동 승급하지 말고 사용자 또는 Control Tower 승인 경계를 따른다.

## 4. 모델 승급 사유가 아닌 것

다음은 모델 성능 부족으로 취급하지 않는다.

- GitHub 권한 문제
- OS/브라우저 문제
- 패키지 설치 문제
- 잘못된 경로
- CI 인프라 장애
- 네트워크 문제
- 사용량 제한
- 외부 서비스 장애
- 요구사항 모순
- 필요한 프로그램이 설치되지 않은 상태

이 경우 작업을 중단하고 원인을 정확하게 기록한다.

## 5. Spark 실패 처리

Spark가 실패하면 즉시 상위 모델로 넘기지 않는다.

실패 원인을 확인한 후 가능하다면 작업 범위를 더 작게 나눈다.

작게 나눈 동일 범위에서도 모델 능력 부족으로 반복 실패하는 것이 확인되면 Luna 또는 적절한 상위 모델로 승급한다.

도구/환경/권한 실패에는 모델 재시도를 낭비하지 않는다.

## 6. AI를 사용하지 않을 작업

가능하면 다음은 결정론적 도구가 직접 수행한다.

- Git 명령
- HEAD/SHA 확인
- build
- unit test
- smoke test
- lint
- 파일 존재 검사
- 정적 validation
- 종료 코드 판정
- checksum
- 구조적 diff 검사

AI는 결과 해석, 원인 분석, 코드 수정이 필요한 경우에만 개입한다.

## 7. DUONIX 환경 경계

DUONIX는 현재 웹 기반 프로젝트를 기준으로 한다.

명시적으로 필요성이 확인되지 않은 상태에서는 다음을 실행하지 않는다.

- Unity Editor
- Unity Hub
- Unity 프로젝트 생성/수정
- Blender
- 다른 게임엔진
- DUONIX와 무관한 외부 개발환경

특히 검증 과정에서 설치된 프로그램을 단순 탐색 목적으로 실행하지 않는다.

필요성이 생기면 먼저 왜 필요한지 보고한다.

## 8. AUTO-001 적용

`AUTO-001`은 개발 기능 추가가 아니라 **저비용 개발 자동화 루프 검증**이 목적이다.

기존 게임 로직, 콘텐츠, 밸런스, 이미지, 음원은 변경하지 않는다.

가능한 작은 작업은 Spark를 우선 사용한다.

검증할 항목:

- 지시 준수
- 허용 범위 밖 파일 변경 여부
- 실제 검증 명령 실행 여부
- PASS/FAIL 재현성
- 실패 후 원인 분류 정확성
- 재시도 횟수
- 작업 소요 시간
- 모델 사용량
- Git checkpoint 정확성
- HANDOFF/상태 기록 정확성

단순히 코드를 생성했다는 이유로 성공 처리하지 않는다.

**완료 조건을 실제 실행 증거로 검증한 경우에만 PASS로 기록한다.**

## 9. 모델 성능 기록

AUTO-001부터 모델별 실적을 누적 기록한다.

최소 기록값:

- MODEL
- TASK_ID
- TASK_TYPE
- RESULT
- ATTEMPTS
- WALL_TIME
- FAILURE_CLASS
- VALIDATION_RESULT
- SCOPE_VIOLATION
- ESCALATED_TO
- 비고

현재 기록:

| MODEL | TASK_ID | TASK_TYPE | RESULT | ATTEMPTS | WALL_TIME | FAILURE_CLASS | VALIDATION_RESULT | SCOPE_VIOLATION | ESCALATED_TO | 비고 |
|---|---|---|---|---:|---|---|---|---|---|---|
| `GPT-5.6 Sol` | `AUTO-001-POLICY-ROUTING-01` | policy/state update | PASS | 2 | `미확인` | 1차 `PERMISSION_FAILURE`; 권한 재승인 후 성공 | repository write 및 Git post-write verification 수행 | NO | NONE | 최초 GitHub write는 403. 사용자 repository access 재승인 후 재시도 성공. 정확한 token/credit 사용량은 `미확인`. |

정확한 토큰/크레딧 사용량을 시스템에서 확인할 수 없는 경우 추정값을 만들지 말고 `미확인`으로 기록한다.

향후 모델 라우팅 정책은 체감이 아니라 이 기록을 근거로 조정한다.

## 10. 사용량 제한 발생 시

어떤 모델이든 사용 한도에 도달하면 프로젝트 상태를 모델 세션에 의존하지 않는다.

중단 전에 가능한 범위에서 다음을 남긴다.

- 현재 Git HEAD
- 마지막 검증 PASS
- 현재 `TASK_ID`
- 완료된 단계
- 미완료 단계
- 실패 원인
- 정확한 `NEXT_STEP`

다음 모델 또는 다음 세션은 이를 직접 확인한 후 이어서 작업한다.

이미 검증 완료된 범위를 처음부터 다시 수행하지 않는다.

## 11. Git 안전 규칙

자동화 실험은 원칙적으로 `main`에서 직접 수행하지 않는다.

작업 브랜치를 사용한다.

예:
`automation/auto-001-bootstrap`

다음은 사용자 또는 Control Tower의 명시적 승인 없이 수행하지 않는다.

- `main` 강제 변경
- force push
- 기존 검증된 파일 대량 삭제
- architecture 변경
- 게임 디자인 변경
- 대규모 refactor
- 기존 asset 교체

작업 완료 후에는 실제 diff와 validation 결과를 확인하고 checkpoint한다.

## 12. 상태 문서 규칙

기존 공식 HANDOFF / 상태 문서 / Decision Ledger의 위치를 먼저 확인한다.

기존 canonical 상태 문서가 존재하면 그것을 사용한다.

존재 여부가 확인되지 않은 상태에서 임의로 새로운 `HANDOFF.md`, `CURRENT_STATE.md` 등을 만들어 Source of Truth로 선언하지 않는다.

canonical 상태 문서가 없다면:

`미확인 — canonical automation state document not established`

로 보고하고 Control Tower에서 위치를 결정한다.

## 13. 현재 사용자 승인

다음 정책은 사용자 승인으로 취급한다.

`APPROVED — GPT-5.3-Codex-Spark active utilization for DUONIX development automation`

단, 이 승인은 모델 사용 정책에 대한 승인이지 개별 기능 구현, architecture 변경 또는 `main` merge 승인으로 확대 해석하지 않는다.

이번 작업에서는 정책 기록 및 AUTO-001 준비 범위를 넘어 새로운 게임 기능을 구현하지 않는다.
