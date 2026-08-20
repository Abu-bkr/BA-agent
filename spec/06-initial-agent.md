In packages/agents/src/llm/, implement a model-agnostic wrapper so every agent node calls one interface regardless of provider, matching the "Model runtime" box in our architecture (gpt, claude, gemini, llama, qwen).

- getChatModel() reads MODEL_PROVIDER and MODEL_NAME from config and returns a LangChain.js-compatible chat model instance (ChatOpenAI, ChatAnthropic, ChatGoogleGenerativeAI, or an Ollama-backed one from @langchain/community for local llama/qwen).
- All agent nodes from Stage 4 import from here, never instantiate a provider SDK directly.
- Add retry/backoff on transient API errors and a request timeout.
- Support a per-agent model override in config (e.g. a smaller/cheaper model for Interview, a stronger one for Documentation), defaulting to the global MODEL_PROVIDER/MODEL_NAME.