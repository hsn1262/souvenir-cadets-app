import { Page, Card, EmptyState } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

// Phase 5: same Invoice logic as Events, but sold straight against the
// Central location, with Shopify Customers standing in for the old
// Client's Database sheet.
export default function OnlineComingSoon() {
  return (
    <Page>
      <TitleBar title="Online Sale" />
      <Card>
        <EmptyState
          heading="Online Sale is coming after Events"
          image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
        >
          <p>
            Reuses the Invoice screen built for Events, pointed at the Central location instead of an
            event Location, with Shopify Customers replacing the old Client's Database.
          </p>
        </EmptyState>
      </Card>
    </Page>
  );
}
