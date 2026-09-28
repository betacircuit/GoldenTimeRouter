import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

const ROW = 48;
function DigitWheel({
  value,
  onChange,
  label,
  max = 9,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ROW;
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const select = (n: number) => {
    if (timer.current) clearTimeout(timer.current);
    onChange(Math.max(0, Math.min(max, n)));
  };
  return (
    <div className="wheel-column">
      <span className="wheel-caption">{label}</span>
      <div
        ref={ref}
        className="digit-wheel"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        onScroll={() => {
          if (timer.current) clearTimeout(timer.current);
          const n = Math.max(
            0,
            Math.min(max, Math.round((ref.current?.scrollTop ?? 0) / ROW)),
          );
          timer.current = setTimeout(() => select(n), 120);
        }}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            select(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? max
                  : value + (e.key === "ArrowDown" ? 1 : -1),
            );
          }
        }}
      >
        {Array.from({ length: max + 1 }, (_, n) => (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${label} ${n}`}
            aria-pressed={value === n}
            className={value === n ? "digit selected" : "digit"}
            key={n}
            onClick={() => select(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NumberWheel({
  label,
  value,
  unit,
  integer = false,
  min,
  max,
  onSave,
  onClose,
}: {
  label: string;
  value: number | null;
  unit: string | null;
  integer?: boolean;
  min?: number;
  max?: number;
  onSave: (value: number | null) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const abs = Math.abs(value ?? 0);
  const [coefficient, exponent = "0"] = String(abs).split("e");
  const precision = Math.max(
    0,
    (coefficient.split(".")[1]?.length ?? 0) - Number(exponent),
  );
  const supported = abs < 1e12 && precision <= 9;
  const fractions = integer
    ? supported
      ? precision
      : 0
    : Math.max(unit === "Cel" ? 1 : 2, supported ? precision : 0);
  const wholeDigits = Math.max(
    max && max < 10 ? 1 : unit === "Cel" ? 2 : 3,
    supported ? String(Math.floor(abs)).length : 1,
  );
  const initial = (supported ? abs : 0)
    .toFixed(fractions)
    .replace(".", "")
    .padStart(wholeDigits + fractions, "0");
  const [digits, setDigits] = useState(initial.split("").map(Number));
  const [negative, setNegative] = useState((value ?? 0) < 0);
  const [touched, setTouched] = useState(value !== null);
  const numeric =
    (Number(digits.join("")) / 10 ** fractions) * (negative ? -1 : 1);
  useLayoutEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const valid =
    Number.isFinite(numeric) &&
    supported &&
    (min === undefined || numeric >= min) &&
    (max === undefined || numeric <= max) &&
    !(integer && (numeric < 0 || !Number.isInteger(numeric)));
  return (
    <dialog
      ref={dialog}
      className="number-dialog"
      aria-labelledby="number-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">SCROLL TO ADJUST</span>
          <h2 id="number-title">{label}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="숫자 선택 닫기"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      <p>
        숫자를 위아래로 밀어 선택하세요. 적용 전에는 기록이 바뀌지 않습니다.
      </p>
      <div className="wheel-value" aria-live="polite">
        {touched ? (supported ? numeric : value) : "미상"}
        <span>{unit || "단위 미상"}</span>
      </div>
      {!supported && (
        <p role="alert">
          값을 반올림하지 않고 유지했습니다. 이 크기·정밀도의 값은 자연어
          기록에서 정정해 주세요.
        </p>
      )}
      <div className="wheel-rack" hidden={!supported}>
        <div className="wheel-selection" />
        {digits.map((digit, i) => (
          <div className="wheel-slot" key={i}>
            {i === wholeDigits && <span className="wheel-decimal">.</span>}
            <DigitWheel
              value={digit}
              max={
                wholeDigits === 1 && fractions === 0 && max !== undefined
                  ? max
                  : 9
              }
              label={
                i < wholeDigits
                  ? `${10 ** (wholeDigits - i - 1)}의 자리`
                  : `소수 ${i - wholeDigits + 1}째 자리`
              }
              onChange={(n) => {
                setDigits((v) => v.map((d, j) => (j === i ? n : d)));
                setTouched(true);
              }}
            />
          </div>
        ))}
      </div>
      {!integer && (
        <button
          type="button"
          className="button ghost sign-toggle"
          onClick={() => {
            setNegative((v) => !v);
            setTouched(true);
          }}
          aria-pressed={negative}
        >
          부호 {negative ? "−" : "+"}
        </button>
      )}
      {!valid && touched && (
        <p role="alert" className="inline-alert">
          이 항목의 허용 범위를 확인해 주세요.
        </p>
      )}
      <div className="wheel-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            onSave(null);
            onClose();
          }}
        >
          미상으로 설정
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!valid || !touched}
          onClick={() => {
            onSave(numeric);
            onClose();
          }}
        >
          <Check size={18} /> 선택 적용
        </button>
      </div>
    </dialog>
  );
}
