import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          "layout-portal": ["./src/components/PortalLayout.tsx"],
          "layout-agent": ["./src/components/AgentLayout.tsx"],
          "layout-admin": ["./src/components/AdminLayout.tsx"],
          "portal-pages": [
            "./src/pages/portal/Dashboard.tsx",
            "./src/pages/portal/Billing.tsx",
            "./src/pages/portal/ApiKeys.tsx",
            "./src/pages/portal/Playground.tsx",
            "./src/pages/portal/Consumption.tsx",
            "./src/pages/portal/Profile.tsx",
            "./src/pages/portal/Security.tsx",
            "./src/pages/portal/Notifications.tsx",
            "./src/pages/portal/Invoices.tsx",
            "./src/pages/portal/Recharge.tsx",
            "./src/pages/portal/Tickets.tsx",
            "./src/pages/portal/Team.tsx",
            "./src/pages/portal/Webhooks.tsx",
            "./src/pages/portal/Logs.tsx",
            "./src/pages/portal/Settings.tsx",
            "./src/pages/portal/AccountDeletion.tsx",
          ],
          "agent-pages": [
            "./src/pages/agent/AgentDashboard.tsx",
            "./src/pages/agent/AgentCustomers.tsx",
            "./src/pages/agent/AgentConsumption.tsx",
            "./src/pages/agent/AgentCommission.tsx",
            "./src/pages/agent/AgentWithdraw.tsx",
          ],
          "admin-core": [
            "./src/pages/admin/AdminDashboard.tsx",
            "./src/pages/admin/AdminCustomers.tsx",
            "./src/pages/admin/AdminFinance.tsx",
            "./src/pages/admin/AdminSupplier.tsx",
            "./src/pages/admin/AdminAgent.tsx",
            "./src/pages/admin/AdminTickets.tsx",
            "./src/pages/admin/AdminSettings.tsx",
          ],
          "admin-config": [
            "./src/pages/admin/AdminCockpit.tsx",
            "./src/pages/admin/AdminModelService.tsx",
            "./src/pages/admin/AdminRoles.tsx",
            "./src/pages/admin/AdminEmailTemplates.tsx",
            "./src/pages/admin/AdminOps.tsx",
            "./src/pages/admin/AdminRisk.tsx",
            "./src/pages/admin/AdminCoupon.tsx",
            "./src/pages/admin/AdminContent.tsx",
          ],
          "admin-ops": [
            "./src/pages/admin/AdminReconciliation.tsx",
            "./src/pages/admin/AdminConsumptionStream.tsx",
            "./src/pages/admin/AdminAnomaly.tsx",
            "./src/pages/admin/AdminBalanceAlert.tsx",
            "./src/pages/admin/AdminSupplierBillMatch.tsx",
            "./src/pages/admin/AdminCustomerLifecycle.tsx",
            "./src/pages/admin/AdminSubscription.tsx",
            "./src/pages/admin/AdminCostPrediction.tsx",
            "./src/pages/admin/AdminVendorPricing.tsx",
            "./src/pages/admin/AdminVendorCost.tsx",
            "./src/pages/admin/AdminVendorStats.tsx",
            "./src/pages/admin/AdminDispute.tsx",
          ],
        },
      },
    },
  },
  server: {
    port: 5175,
    proxy: {
      "/v1": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/api/v1": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
