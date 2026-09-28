export function transactionDate(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  return String(value ?? "").slice(0, 10);
}

export function transactionKey(date, description, amount) {
  const normalizedDescription = String(description ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
  return `${transactionDate(date)}\u0000${normalizedDescription}\u0000${Number(amount).toFixed(2)}`;
}
