// Use the facility's familiar name on small cards; retain the official name in
// the accessible control name, contact card and detailed record.
const familiarNames = [
  "강남세브란스병원",
  "강남차병원",
  "서울성모병원",
  "순천향대학교부속서울병원",
];

export function hospitalCardName(officialName: string) {
  const familiar = familiarNames.find((name) => officialName.endsWith(name));
  return familiar || officialName;
}
