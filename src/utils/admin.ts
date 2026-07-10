// 관리자 UID allowlist — firestore.rules의 theaterLayouts write 조건과 동일하게 유지해야 함
// 이메일 대신 UID 사용: UID는 유출돼도 신원 특정이나 로그인에 쓰일 수 없는 값이라 개인정보 노출 우려가 없음
import type { User } from 'firebase/auth'

const ADMIN_UIDS = ['VS4QAYyaTpgJBDVjCGBkJ3yvEWl2']

export function isAdmin(user: User | null): boolean {
  return !!user?.uid && ADMIN_UIDS.includes(user.uid)
}
