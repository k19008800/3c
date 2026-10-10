// ESLint flat config（ESLint 9）
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // e2e/ 与 scripts/ 是 Node 侧 CommonJS 工具脚本（非浏览器代码），
    // 需显式声明 Node globals，否则 console/process 被误报 no-undef。
    files: ["e2e/**/*.cjs", "scripts/**/*.cjs", "scripts/**/*.js", "**/*.cjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        // addInitScript 回调体在浏览器上下文执行
        localStorage: "readonly",
        window: "readonly",
        document: "readonly",
      },
      sourceType: "commonjs",
    },
    rules: {
      // .cjs 脚本必须用 require()（ESM 语法在 CJS 中不合法）
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
