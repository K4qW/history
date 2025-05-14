import { USER } from "../core/manager.js";

/**
 * 替换字符串中的user标签
 */
export function replaceUserTag(str) {
    if (str == null) return ''; // 处理 null 或 undefined
    if (typeof str !== 'string') {
        console.warn('非字符串输入:', str);
        str = String(str); // 强制转换为字符串
    }
    return str.replace(/<user>/g, USER.getContext().name1);
}

/**
 * 将单元格中的逗号替换为/符号
 * @param {string | number} cell
 * @returns 处理后的单元格值
 */
export function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * 截断最后的括号后的内容
 * @param {string} str
 * @returns {string} 处理后的字符串
 */
export function truncateAfterLastParenthesis(str) {
    const lastIndex = str.lastIndexOf(')');
    if (lastIndex !== -1) {
        return str.slice(0, lastIndex).trim();
    }
    return str.trim();
}

/**
 * 解析字符串字典为对象
 * @param {*} str
 * @returns object
 */
export function parseLooseDict(str) {
    const result = {};
    const content = str.replace(/\s+/g,'').slice(1, -1); // 去除最外层 {}
    console.log("解析",content)
    let i = 0;
    const len = content.length;

    while (i < len) {
        // 读取 key
        let key = '';
        while (i < len && content[i] !== ':') {
            key += content[i++];
        }
        key = key.trim().replace(/^["']|["']$/g, ''); // 去除引号
        i++; // 跳过冒号

        // 读取 value
        let value = '';
        let quoteChar = null;
        let inString = false;

        // 判断起始引号（可以没有）
        if (content[i] === '"' || content[i] === "'") {
            quoteChar = content[i];
            inString = true;
            i++;
        }

        while (i < len) {
            const char = content[i];

            if (inString) {
                // 如果遇到嵌套引号，替换为另一种
                if (char === quoteChar) {
                    if (content[i + 1] === ','||content[i + 1] == null) {
                        i++; // 跳过结尾引号
                        break;
                    } else {
                        value += char === '"' ? "'" : '"'
                        i++;
                        continue;
                    }
                }

                value += char;
            } else {
                // 无引号字符串，直到逗号结束
                if (char === ',') break;
                value += char;
            }

            i++;
        }

        result[key] = value.trim().replace(/,/g, '/'); // 替换逗号

        // 跳过分隔符和空格
        while (i < len && (content[i] === ',' || content[i] === ' ')) {
            i++;
        }
    }
    console.log('解析后的对象:', result);

    return result;
}
