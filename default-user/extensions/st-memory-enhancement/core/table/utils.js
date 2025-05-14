export const cellStyle = `
    .sheet-table { border-collapse: collapse; width: max-content; }
    .sheet-cell { border: 1px solid var(--SmartThemeBodyColor); padding: 1px; min-width: 28px; text-align: center; vertical-align: middle; cursor: cell; }
    .sheet-cell-origin { min-width: 20px; min-height: 20px }
    .sheet-header-cell-top { font-weight: bold }
    .sheet-header-cell-left { font-weight: bold }
    .sheet-cell-other { min-width: 50px; border: 1px dashed var(--SmartThemeEmColor); }
`

// Helper function to convert column index to letter (A, B, C...)
export function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

export function filterSavingData(sheet) {
    const r = {
        uid: sheet.uid,
        name: sheet.name,
        domain: sheet.domain,
        type: sheet.type,
        enable: sheet.enable,
        required: sheet.required,
        tochat: sheet.tochat,
        hashSheet: sheet.hashSheet, // 保存 hashSheet (只包含 cell uid)
        cellHistory: sheet.cellHistory.map((
            {
                parent,
                element,
                customEventListeners,
                ...filter
            }) => {
            return filter;
        }), // 保存 cellHistory (不包含 parent)
        config: sheet.config,
    };
    const rr = JSON.parse(JSON.stringify(r));
    return rr;
}
