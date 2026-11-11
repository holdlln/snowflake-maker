# ❄️ 눈결정 만들기 ❄️

종이를 접고 오려 나만의 눈결정을 만드는 웹 앱입니다. 두 가지 방법으로 실행할 수 있습니다.

## 1. 웹에서 바로 사용하기

**[눈결정 만들기 열기](https://holdlln.github.io/snowflake-maker/)**

설치 없이 최신 웹 브라우저에서 사용합니다.

## 2. 내 컴퓨터에서 실행하기

Python 3이 필요합니다. [소스 저장소](https://github.com/holdlln/snowflake-maker)에서 **Code → Download ZIP**으로 내려받아 압축을 풉니다. 이미 프로젝트 파일이 있다면 그대로 사용해도 됩니다.

아래 세 폴더가 함께 있는 **프로젝트 폴더에서 터미널을 엽니다.**

```text
프로젝트 폴더/
├─ paper-cut-simulator/
├─ rabbit-ear/
└─ icurve/
```

Windows PowerShell:

```powershell
py -3 -m http.server 18765 --bind 127.0.0.1
```

macOS / Linux:

```sh
python3 -m http.server 18765 --bind 127.0.0.1
```

브라우저에서 [로컬 실행 화면](http://127.0.0.1:18765/paper-cut-simulator/)을 엽니다. 종료할 때는 터미널에서 `Ctrl+C`를 누릅니다.

`index.html`을 더블 클릭하면 JavaScript 모듈과 WebAssembly를 불러올 수 없으므로 위 서버로 실행합니다. Windows에서 `py`를 찾을 수 없다면 `python`으로 바꾸세요. 포트가 사용 중이면 명령과 주소의 `18765`를 같은 다른 번호로 바꿉니다.

## 사용법

1. **접기**에서 두 점을 찍고 넘길 쪽을 선택합니다.
2. **오리기**에서 직선·베지어 경로를 닫고, **잘라내기** 또는 **남기기**를 확정합니다.
3. **한 단계 펼치기**로 결과를 확인합니다.
4. **결정 보관하기**로 이름을 붙이고, **눈 내리는 밤**에서 감상합니다.

보관한 결정은 해당 브라우저에 저장됩니다. 웹사이트와 로컬 실행의 보관함은 서로 별개입니다.

오픈소스 출처는 [OPEN_SOURCE.txt](./paper-cut-simulator/OPEN_SOURCE.txt), 원리·검증·시연 기록은 [PROJECT_NOTES.md](./paper-cut-simulator/PROJECT_NOTES.md)에 있습니다. 로컬 실행·제출 시 위 세 폴더와 라이선스 파일을 함께 보관하세요.
