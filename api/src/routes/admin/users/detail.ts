// 重构迁移说明：路由逻辑已拆分至 detail/ 子目录
// 此文件保留为 re-export 入口，保持外部导入路径兼容
export { detailRoutes } from "./detail/index.js";
