import type { MaterialOption } from "../../../src/shared/types.js";
const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function MaterialOptions({
  options,
  selectedOptionId,
  onSelect,
}: {
  options: MaterialOption[];
  selectedOptionId?: string;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="material-options">
      <span className="eyebrow">MATERIAL OPTIONS</span>
      {options.map((option) => (
        <button
          key={option.id}
          className={selectedOptionId === option.id ? "selected" : ""}
          onClick={() => onSelect(option.id)}
        >
          <span>
            <strong>{option.label}</strong>
            <small>
              {option.deliveryDays} days · {money.format(option.estimatedCost)}
            </small>
          </span>
          <b>{option.available ? "AVAILABLE" : "ORDER"}</b>
        </button>
      ))}
    </div>
  );
}
