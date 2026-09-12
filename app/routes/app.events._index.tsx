import { Page, Card, EmptyState } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

// Phase 3 of the rebuild: each event becomes a Shopify Location, Allocate
// and Close become inventoryMoveQuantities calls between Central and the
// event's Location, and Token/Invoice (Phase 4) run against that Location's
// stock. Scaffolded here so the nav shows the full shape of the finished
// app; the working screens land in the next phase of the build.
export default function EventsComingSoon() {
  return (
    <Page>
      <TitleBar title="Event Sale" />
      <Card>
        <EmptyState
          heading="Events are next"
          image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
        >
          <p>
            Events (Token, Invoice, Allocate, Close, Expenses, Event Reports) map onto Shopify Locations
            and Draft Orders — that build is the next phase after Central Inventory. Central Inventory is
            live now under that tab.
          </p>
        </EmptyState>
      </Card>
    </Page>
  );
}
