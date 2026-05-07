import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  getClientRemote,
  registerClientRemote,
  type RegisteredClient,
} from "./internal-api.js";

function toSdkShape(row: RegisteredClient): OAuthClientInformationFull {
  return {
    client_id: row.client_id,
    client_name: row.client_name ?? undefined,
    redirect_uris: row.redirect_uris,
    grant_types: row.grant_types as any,
    token_endpoint_auth_method: row.token_endpoint_auth_method as any,
    client_secret: row.client_secret ?? undefined,
    client_secret_expires_at: row.client_secret_expires_at ?? undefined,
    client_id_issued_at: row.client_id_issued_at,
  };
}

export class ClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const row = await getClientRemote(clientId);
    return row ? toSdkShape(row) : undefined;
  }

  async registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): Promise<OAuthClientInformationFull> {
    const row = await registerClientRemote({
      client_name: client.client_name ?? null,
      redirect_uris: client.redirect_uris,
      grant_types: (client.grant_types ?? ["authorization_code", "refresh_token"]) as string[],
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
    });
    return toSdkShape(row);
  }
}
