import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["test/**/*.test.js", "test/**/*.spec.js", "test/**/*.test.ts", "test/**/*.spec.ts"],
        exclude: ["test/test-workspace/**"],
        environment: "node",
        globals: true,
        coverage: {
            reporter: ["text", "json", "html"],
            include: ["tools/**/*.js"],
            exclude: ["test/**", "node_modules/**"],
        },
    },
});
