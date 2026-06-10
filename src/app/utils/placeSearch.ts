import type { Destination } from '../store/appStore';

/**
 * 장소 카탈로그를 검색어로 필터링한다 (실시간 type-to-filter용).
 * - 검색어가 비거나 공백뿐이면 빈 배열을 반환(호출부에서 '최근 검색'을 대신 노출).
 * - 이름/주소 어느 쪽이든 부분일치, 앞뒤 공백 트림 + 라틴 대소문자 무시.
 *
 * 백엔드 장소검색(maps API) 연동 시에도 동일 시그니처로 교체 가능하도록 분리.
 */
export function filterPlaces(catalog: Destination[], keyword: string): Destination[] {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return [];
  return catalog.filter(
    (p) =>
      p.name.toLowerCase().includes(trimmed) ||
      p.address.toLowerCase().includes(trimmed),
  );
}
