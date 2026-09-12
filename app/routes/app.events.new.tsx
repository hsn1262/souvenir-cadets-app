import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useActionData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";
import { Page, Card, BlockStack, TextField, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createEvent } from "../models/events.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  let event;
  try {
    event = await createEvent(admin, {
      name: body.name,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
  } catch (err: any) {
    return { ok: false, error: err.message || "Something went wrong creating the event." };
  }
  return redirect(`/app/events/${event.id.split("/").pop()}`);
};

export default function NewEvent() {
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";
  const actionData = useActionData<typeof action>();

  const [name, setName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (actionData && "error" in actionData && actionData.error) {
      setError(actionData.error);
    }
  }, [actionData]);

  const handleSubmit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Give the event a name.");
      return;
    }
    if (!dateFrom || !dateTo) {
      setError("Set both a start and end date.");
      return;
    }
    submit({ name, dateFrom, dateTo }, { method: "POST", encType: "application/json" });
  };

  return (
    <Page>
      <TitleBar title="New event">
        <button onClick={() => navigate("/app/events")}>Cancel</button>
        <button variant="primary" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Creating…" : "Create event"}
        </button>
      </TitleBar>
      <BlockStack gap="400">
        {error && (
          <Card>
            <Text as="p" tone="critical">
              {error}
            </Text>
          </Card>
        )}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Event details
            </Text>
            <TextField
              label="Event name"
              value={name}
              onChange={setName}
              autoComplete="off"
              helpText="Becomes a new Shopify Location — merchants will also see it under Settings > Locations."
            />
            <TextField label="Start date" type="date" value={dateFrom} onChange={setDateFrom} autoComplete="off" />
            <TextField label="End date" type="date" value={dateTo} onChange={setDateTo} autoComplete="off" />
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
