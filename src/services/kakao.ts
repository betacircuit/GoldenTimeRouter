import type { Origin } from "../domain";

// Narrow SDK boundary: dynamic constructors are confined to map integration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KakaoSDK = any;
declare global {
  interface Window {
    kakao?: KakaoSDK;
  }
}
export const hasKakaoKey = Boolean(import.meta.env.VITE_KAKAO_MAP_APP_KEY);
let sdkPromise: Promise<KakaoSDK> | undefined;
export function loadKakao(): Promise<KakaoSDK> {
  if (!hasKakaoKey)
    return Promise.reject(new Error("지도 연결 정보가 없습니다."));
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error("지도를 불러오지 못했습니다."));
    }, 12000);
    const loaded = () =>
      window.kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve(window.kakao);
      });
    if (window.kakao?.maps) {
      loaded();
      return;
    }
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(import.meta.env.VITE_KAKAO_MAP_APP_KEY)}&autoload=false&libraries=services`;
    script.onload = () => {
      if (window.kakao?.maps) loaded();
      else {
        clearTimeout(timeout);
        reject(new Error("지도 연결을 확인해 주세요."));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error("지도를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}

export async function searchAddress(query: string): Promise<Origin[]> {
  const sdk = await loadKakao();
  return new Promise((resolve, reject) => {
    const geocoder = new sdk.maps.services.Geocoder();
    geocoder.addressSearch(
      query,
      (
        results: Array<{ address_name: string; x: string; y: string }>,
        status: string,
      ) => {
        if (status === sdk.maps.services.Status.OK)
          resolve(
            results
              .slice(0, 5)
              .map((item) => ({
                label: item.address_name,
                lat: Number(item.y),
                lng: Number(item.x),
              })),
          );
        else if (status === sdk.maps.services.Status.ZERO_RESULT) resolve([]);
        else
          reject(new Error("주소를 검색하지 못했습니다. 다시 시도해 주세요."));
      },
    );
  });
}
