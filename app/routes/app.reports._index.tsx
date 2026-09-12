import { Page, Card, EmptyState } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

// Phase 6: Event Sales Report, Online Sales Report, and Combined Report,
// computed from Orders (filtered by Location for event reports) plus the
// Event Expense metaobjects and the SaleCostSnapshot table (see
// prisma/schema.prisma) that preserves cost-basis at time of sale.
export default function ReportsComingSoon() {
  return (
    <Page>
      <TitleBar title="Reports" />
      <Card>
        <EmptyState
          heading="Reports land after Events and Online Sale"
          image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
        >
          <p>
            Revenue, COGS, gross profit and top-products, computed from real Orders plus the expense
            metaobjects — once there are Orders and Expenses to report on.
          </p>
        </EmptyState>
      </Card>
    </Page>
  );
}
