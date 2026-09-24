// vitest 전용 스텁. 'server-only' 는 Next 번들러가 제공하는 클라이언트 import 가드라
// node_modules 에 없고 vitest 에서는 해석되지 않는다. 서버 모듈을 단위 테스트할 때 빈 모듈로 대체한다.
export {};
