# ATON Calendar Refactored Firebase

HTML/CSS/JS를 분리하고 Firebase Authentication + Firestore 실시간 동기화를 붙인 버전입니다.

## 파일 구조

```text
index.html                 화면 구조
css/style.css              디자인
js/firebase-config.js      Firebase 프로젝트 연결 설정
js/app.js                  로그인, 일정, 보관자료, 실시간 동기화 로직
.github/workflows/pages.yml GitHub Actions 배포용 파일
```

## 동작 방식

- 개인 일정: `events` 컬렉션에서 `ownerUid == 로그인 사용자 uid`인 문서만 표시합니다.
- 과 일정: `events` 컬렉션에서 `scope == '과'`인 문서를 모든 로그인 사용자가 같이 봅니다.
- 보관자료: `docs` 컬렉션에서 `ownerUid == 로그인 사용자 uid`인 문서만 표시합니다.
- 모바일/PC/다른 브라우저에서 같은 계정으로 로그인하면 실시간으로 반영됩니다.

## Firebase에서 꼭 켜야 하는 것

1. Authentication > Sign-in method > Email/Password 활성화
2. Firestore Database 생성
3. Authentication > Settings > Authorized domains에 배포 도메인 확인
   - 로컬 테스트: `localhost`
   - GitHub Pages: `tmdgh9693.github.io`

## Firestore Rules 추천

Firebase Console > Firestore Database > Rules에 아래 규칙을 적용하세요.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    match /users/{uid} {
      allow read: if signedIn();
      allow create, update, delete: if signedIn() && request.auth.uid == uid;
    }

    match /events/{eventId} {
      // 과 일정은 로그인 사용자 모두 읽기 가능, 개인 일정은 본인만 읽기 가능
      allow read: if signedIn() && (
        resource.data.scope == '과' ||
        resource.data.ownerUid == request.auth.uid
      );

      // 개인 일정은 본인 ownerUid로만 작성 가능
      // 과 일정은 현재 로그인 사용자가 생성할 수 있게 허용
      allow create: if signedIn() && (
        request.resource.data.ownerUid == request.auth.uid ||
        request.resource.data.scope == '과'
      );

      // 개인 일정은 본인만 수정/삭제 가능
      // 과 일정은 우선 로그인 사용자 모두 수정/삭제 가능하게 둔 상태입니다.
      // 실제 운영에서는 관리자 권한 필드를 추가하는 것을 추천합니다.
      allow update, delete: if signedIn() && (
        resource.data.ownerUid == request.auth.uid ||
        resource.data.scope == '과'
      );
    }

    match /docs/{docId} {
      allow read, create, update, delete: if signedIn() && (
        resource.data.ownerUid == request.auth.uid ||
        request.resource.data.ownerUid == request.auth.uid
      );
    }

    match /settings/{settingId} {
      allow read: if signedIn();
      allow write: if signedIn();
    }
  }
}
```

## GitHub Pages 배포

### 쉬운 방법

Settings > Pages > Source를 `Deploy from a branch`로 바꾸고:

- Branch: `main`
- Folder: `/ (root)`

으로 저장하면 됩니다.

### GitHub Actions 방법

이 압축파일에는 `.github/workflows/pages.yml`도 포함되어 있습니다.
Settings > Pages > Source를 `GitHub Actions`로 쓰고 싶으면 이 파일을 같이 업로드하세요.

## 보완한 부분

- Firebase SDK 주석 처리 문제 수정
- `firebase-config.js`가 `window.firebaseConfig`를 만들도록 수정
- 개인 일정 삭제 시 Firestore에서도 삭제되도록 수정
- 개인 일정에서 과 일정 반영을 해제했을 때 기존 과 일정 복사본이 남지 않도록 수정
- 주요 함수와 Firebase 구조에 주석 추가
- GitHub Actions 배포 파일 추가

## 추가로 보완하면 좋은 부분

- 관리자 계정만 과 일정을 삭제/수정할 수 있게 `role: 'admin'` 권한 추가
- 비밀번호 재설정 기능 추가
- 일정 첨부파일이 필요하면 Firebase Storage 연결
- 검색/필터 기능 강화
- Firestore 인덱스 필요 시 콘솔 안내 링크에 따라 인덱스 생성
