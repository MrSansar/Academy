type Cell = string | number | boolean | null | undefined

function cell(value: Cell): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Stop spreadsheet apps from running a student-entered name as a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, rows: readonly (readonly Cell[])[]): void {
  // BOM so Excel opens UTF-8 (e.g. Japanese names) correctly.
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
