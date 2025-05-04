let sheet = null;
let config = {};
let selectedCustomStyle = null;

function staticPipeline() {
    const regexReplace = selectedCustomStyle.replace || '';
    if (!regexReplace || regexReplace === '') return sheet?.element || '<div>表格数据未加载</div>';
    if (!sheet) return regexReplace;
    return regexReplace.replace(/\$(\w)(\d+)/g, (match, colLetter, rowNumber) => {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const rowIndex = parseInt(rowNumber);
        const c = sheet.findCellByPosition(rowIndex, colIndex);
        return c ? (c.data.value || `<span style="color: red">?</span>`) :
            `<span style="color: red">无单元格</span>`;
    });
}

function loadValueSheetBySheetHashSheet(instance) {
    if (!instance) return;
    return instance.hashSheet.map(row => row.map(hash => {
        const cell = instance.cells.get(hash);
        return cell ? cell.data.value : '';
    }));
}

function toArray(valueSheet) {
    return valueSheet
}

function toHtml(valueSheet) {
    // 将 valueSheet 转换为 HTML 表格
    let html = '<table>';
    for (const row of valueSheet) {
        html += '<tr>';
        for (const cell of row) {
            html += `<td>${cell}</td>`;
        }
        html += '</tr>';
    }
    html += '</table>';
    return html;
}

function toCSV(valueSheet) {
    // 将 valueSheet 转换为 CSV 格式，并跳过首行表头
    return valueSheet.slice(1).map(row => row.join(',')).join('\n');
}

function toMarkdown(valueSheet) {
    // 将 valueSheet 转换为 Markdown 表格
    let markdown = '| ' + valueSheet[0].join(' | ') + ' |\n';
    markdown += '| ' + valueSheet[0].map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < valueSheet.length; i++) {
        markdown += '| ' + valueSheet[i].join(' | ') + ' |\n';
    }
    return markdown;
}

function toJSON(valueSheet) {
    // 将 valueSheet 转换为 JSON 格式
    const columns = valueSheet[0];
    const content = valueSheet.slice(1);
    const json = content.map(row => {
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = row[i];
        }
        return obj;
    });
    return JSON.stringify(json, null, 2);
}

function regexReplacePipeline(text) {
    if (!text || text === '') return text;
    if (!selectedCustomStyle) return text;

    // Get regex and replace strings from the configuration
    const regexString = selectedCustomStyle.regex || '';
    const replaceString = selectedCustomStyle.replace || '';

    // If either regex or replace is empty, return the original text
    if (!regexString || regexString === '') return text;

    try {
        // Extract regex pattern and flags
        let regexPattern = regexString;
        let regexFlags = '';

        // Check if the regex string is in format /pattern/flags
        const regexParts = regexString.match(/^\/(.*?)\/([gimuy]*)$/);
        if (regexParts) {
            regexPattern = regexParts[1];
            regexFlags = regexParts[2];
        }

        // Create a new RegExp object
        const regex = new RegExp(regexPattern, regexFlags);

        // Process the replacement string to handle escape sequences
        let processedReplaceString = replaceString
            .replace(/\\n/g, '\n')   // Convert \n to actual newlines
            .replace(/\\t/g, '\t')   // Convert \t to actual tabs
            .replace(/\\r/g, '\r')   // Convert \r to actual carriage returns
            .replace(/\\b/g, '\b')   // Convert \b to actual backspace
            .replace(/\\f/g, '\f')   // Convert \f to actual form feed
            .replace(/\\v/g, '\v')   // Convert \v to actual vertical tab
            .replace(/\\\\/g, '\\'); // Convert \\ to actual backslash

        // Apply the regex replacement first
        let result = text.replace(regex, processedReplaceString);

        // Now convert newlines to HTML <br> tags to ensure they display properly in HTML
        if (selectedCustomStyle.basedOn !== 'html' && selectedCustomStyle.basedOn !== 'csv') {  //增加条件不是CSV格式的文本，目前测试出CSV使用该代码会出现渲染错误
            result = result.replace(/\n/g, '<br>');
        }

        return result;
    } catch (error) {
        console.error('Error in regex replacement:', error);
        return text; // Return original text on error
    }
}

export function initializeText(target, selectedStyle) {
    let initialize = '';
    let result = selectedStyle.replace || '';
    if (!result || result === '') return target?.element || '<div>表格数据未加载</div>';

    const valueSheet = loadValueSheetBySheetHashSheet(target);
    const method = selectedStyle.basedOn || 'array';
    switch (method) {
        case 'array':
            initialize = toArray(valueSheet);
            break;
        case 'html':
            initialize = toHtml(valueSheet);
            break;
        case 'csv':
            initialize = toCSV(valueSheet);
            break;
        case 'markdown':
            initialize = toMarkdown(valueSheet);
            break;
        case 'json':
            initialize = toJSON(valueSheet);
            break;
        default:
            console.error('不支持的格式:', method);
    }
    // console.log('初始化值:', method, initialize);
    return initialize;
}

function regexPipeline(target, selectedStyle = selectedCustomStyle) {
    const initText = initializeText(target, selectedStyle);
    const r = regexReplacePipeline(initText);   // 使用正则表达式替换

    return r
}

function executeRendering(target) {
    let resultHtml = target?.element || '<div>表格数据未加载</div>';
    if (config.useCustomStyle === false) {
        // resultHtml = target?.element || '<div>表格数据未加载</div>';
        throw new Error('未启用自定义样式，你需要在 parseSheetRender 外部排除 config.useCustomStyle === false 的情况');
    }
    if (selectedCustomStyle.mode === 'regex') {
        resultHtml = regexPipeline(target);
    } else if (selectedCustomStyle.mode === 'static') {
        resultHtml = staticPipeline();
    }
    return resultHtml;
}

/**
 * 解析表格渲染样式
 * @param {Object} instance 表格对象
 * @param {Object} rendererConfig 渲染配置
 * @returns {string} 渲染后的HTML
 */
export function parseSheetRender(instance, rendererConfig = undefined) {
    sheet = JSON.parse(JSON.stringify(instance));
    if (rendererConfig !== undefined) {
        config = rendererConfig;
    } else {
        config = sheet.config || {};
    }
    selectedCustomStyle = config.customStyles[config.selectedCustomStyleKey];

    const r = executeRendering(instance);
    return r;
}
