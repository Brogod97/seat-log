# Seat Log

영화관 지점·상영관별 좌석 배치도를 그리고 **추천 명당 / 실관람 좌석 / 중앙열 / 시선일치행 / 복도 / 제외구역 / 출입구**를 표시해 **이미지(PNG)로 내보내는 개인용 생성기**. 좌석 후기 이미지를 깔끔하게 뽑는 것이 목적.

## 기능

- 좌석 그리드 편집 (드래그로 크기 지정, 복도·제외구역·출입구)
- 색 레이어: 중앙열(자동)·시선일치행·명당 범위·실관람 좌석(+메모)
- 브랜드별 액센트 테마 (CGV·메가박스·롯데시네마)
- PNG 이미지 다운로드 (제목·범례 포함)
- 저장/불러오기 (localStorage) + JSON 내보내기·가져오기
- 다크/라이트 모드, 반응형(모바일·태블릿·PC), PWA(설치·오프라인)
- Firebase(Google 로그인)로 기기 간 저장 목록 동기화 — 선택 사항, 로컬 우선

## 기술 스택

React 19 + TypeScript + Vite · Tailwind CSS v4 · html-to-image · Firebase(Auth·Firestore)

## 개발

```bash
npm install
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드 (dist)
npm run preview # 빌드 결과 로컬 서빙 (PWA 확인용)
```
