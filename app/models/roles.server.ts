// Replaces Code.gs's ADMIN_PIN model.
//
// Old system: one shared "1234" PIN, checked with a plain string compare,
// guarded every destructive action (reset stock, delete event, bulk delete
// invoices, reset sales logs) for anyone who had the link.
//
// New system: every request already carries a real, logged-in Shopify
// staff identity (via the online-access session — see shopify.server.ts).
// This module keeps a small allow-list of which staff members are allowed
// to perform destructive actions ("MANAGER"); everyone else is "STAFF" and
// the UI simply hides those buttons. Shopify's own staff permissions are
// coarser than this (they gate the whole app, not a single button), so
// this table is the fine-grained layer on top of that.

import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";
import { ROLE_MANAGER, ROLE_STAFF } from "../lib/constants";

export type StaffRoleRecord = {
  staffMemberGid: string;
  staffName: string;
  staffEmail: string | null;
  role: string;
};

export async function listStaffRoles(shop: string): Promise<StaffRoleRecord[]> {
  return prisma.staffRole.findMany({
    where: { shop },
    orderBy: { staffName: "asc" },
    select: { staffMemberGid: true, staffName: true, staffEmail: true, role: true },
  });
}

export async function isManager(shop: string, staffMemberGid: string | undefined | null) {
  if (!staffMemberGid) return false;
  const record = await prisma.staffRole.findUnique({
    where: { shop_staffMemberGid: { shop, staffMemberGid } },
  });
  return record?.role === ROLE_MANAGER;
}

export async function setStaffRole(
  shop: string,
  staffMemberGid: string,
  staffName: string,
  staffEmail: string | null,
  role: typeof ROLE_MANAGER | typeof ROLE_STAFF,
) {
  return prisma.staffRole.upsert({
    where: { shop_staffMemberGid: { shop, staffMemberGid } },
    update: { role, staffName, staffEmail },
    create: { shop, staffMemberGid, staffName, staffEmail, role },
  });
}

// Pulls the shop's staff list from Shopify itself (source of truth for
// names/emails), so the Settings screen can show every staff member even
// before they've been assigned a role in our own table.
export async function listShopStaffMembers(admin: AdminApiContext) {
  const response = await admin.graphql(
    `#graphql
      query ShopStaffMembers($first: Int!) {
        shop {
          staffMembers(first: $first) {
            edges {
              node {
                id
                name
                email
                active
              }
            }
          }
        }
      }`,
    { variables: { first: 50 } },
  );
  const json = await response.json();
  const edges = json.data?.shop?.staffMembers?.edges ?? [];
  return edges.map((e: any) => e.node) as {
    id: string;
    name: string;
    email: string | null;
    active: boolean;
  }[];
}

// Resolves "who is making this request" from the online-access session.
// Returns null for an offline session (background jobs, webhooks) — those
// callers should never be able to trigger a destructive, staff-attributed
// action anyway.
export function getActingStaffMember(session: {
  onlineAccessInfo?: {
    associated_user?: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
    };
  } | null;
}) {
  const user = session.onlineAccessInfo?.associated_user;
  if (!user) return null;
  return {
    gid: `gid://shopify/StaffMember/${user.id}`,
    name: `${user.first_name} ${user.last_name}`.trim(),
    email: user.email,
  };
}
