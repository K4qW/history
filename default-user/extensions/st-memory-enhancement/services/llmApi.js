export class LLMApiService {
    constructor(config = {}) {
        this.config = {
            api_url: config.api_url || "https://api.openai.com/v1",
            api_key: config.api_key || "",
            model_name: config.model_name || "gpt-3.5-turbo",
            system_prompt: config.system_prompt || "You are a helpful assistant.",
            temperature: config.temperature || 1.0,
            max_tokens: config.max_tokens || 4096,
            stream: config.stream || false,
        };
    }

    async callLLM(textToTranslate, streamCallback = null) {
        if (!textToTranslate || textToTranslate.trim().length < 2) {
            throw new Error("输入文本太短");
        }

        if (!this.config.api_url || !this.config.api_key || !this.config.model_name) {
            throw new Error("API配置不完整");
        }

        let apiEndpoint = this.config.api_url;
        if (!apiEndpoint.endsWith("/chat/completions")) {
            apiEndpoint += "/chat/completions";
        }

        const headers = {
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Type': 'application/json'
        };

        const messages = [
            { role: 'system', content: this.config.system_prompt },
            { role: 'user', content: textToTranslate }
        ];

        this.config.stream = streamCallback !== null;

        const data = {
            model: this.config.model_name,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            stream: this.config.stream
        };

        try {
            if (this.config.stream) {
                if (!streamCallback || typeof streamCallback !== 'function') {
                    throw new Error("流式模式下必须提供有效的streamCallback函数");
                }

                return await this.#handleStreamResponse(apiEndpoint, headers, data, streamCallback);
            } else {
                return await this.#handleRegularResponse(apiEndpoint, headers, data);
            }
        } catch (error) {
            console.error("LLM API调用错误:", error);
            throw error;
        }
    }

    async #handleRegularResponse(apiEndpoint, headers, data) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();

        if (!responseData.choices || responseData.choices.length === 0 ||
            !responseData.choices[0].message || !responseData.choices[0].message.content) {
            throw new Error("API返回无效的响应结构");
        }

        let translatedText = responseData.choices[0].message.content;
        return this.#cleanResponse(translatedText);
    }

    async #handleStreamResponse(apiEndpoint, headers, data, streamCallback) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("无法获取响应流");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    try {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr === '[DONE]') continue;

                            const jsonData = JSON.parse(dataStr);
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                        }
                    } catch (e) {
                        console.warn("解析流数据失败:", e, "数据:", line);
                    }
                }
            }

            // 处理缓冲区剩余内容
            if (buffer.trim()) {
                try {
                    const jsonData = JSON.parse(buffer);
                    if (jsonData.choices?.[0]?.delta?.content) {
                        const content = jsonData.choices[0].delta.content;
                        fullResponse += content;
                        streamCallback(content);
                    }
                } catch (e) {
                    console.warn("解析缓冲区数据失败:", e);
                }
            }

            return this.#cleanResponse(fullResponse);
        } finally {
            reader.releaseLock();
        }
    }

    #cleanResponse(text) {
        if (!text || text.trim() === "") {
            throw new Error("API返回了空的翻译结果");
        }

        // 清理思维链标记
        const thinkingRegex = /<(?:thinking|think)>(.*?)<\/(?:thinking|think)>/gs;
        return text.replace(thinkingRegex, '').trim();
    }

    async testConnection() {
        const testMessage = "Hello, can you hear me? Please respond with a simple yes.";

        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: testMessage }
        ];

        let apiEndpoint = this.config.api_url;
        if (!apiEndpoint.endsWith("/chat/completions")) {
            apiEndpoint += "/chat/completions";
        }

        const headers = {
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Type': 'application/json'
        };

        const data = {
            model: this.config.model_name,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            stream: false
        };

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API测试请求失败: ${response.status} - ${errorText}`);
            }

            const responseData = await response.json();
            return responseData.choices[0].message.content;
        } catch (error) {
            console.error("API连接测试错误:", error);
            throw error;
        }
    }
}

export default LLMApiService;
