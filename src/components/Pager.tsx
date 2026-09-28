import { ChevronLeft, ChevronRight } from "lucide-react";
export default function Pager({ page, count, onChange, label = "페이지" }: { page: number; count: number; onChange: (page: number) => void; label?: string }) {
  if (count <= 1) return null;
  return <nav className="tap-pager" aria-label={label}><button type="button" className="button secondary" aria-label={`${label} 이전`} disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={19}/> 이전</button><span aria-live="polite">{page + 1} / {count}</span><button type="button" className="button secondary" aria-label={`${label} 다음`} disabled={page >= count - 1} onClick={() => onChange(page + 1)}>다음 <ChevronRight size={19}/></button></nav>;
}
