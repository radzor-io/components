// @radzor/saml-auth — SAML 2.0 SSO authentication (SP-initiated)

import { createSign, createVerify, randomUUID, createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export interface SamlConfig {
  entityId: string;
  acsUrl: string;
  idpLoginUrl: string;
  idpCert: string;
  privateKey?: string;
}

export interface SamlUser {
  nameId: string;
  attributes: Record<string, string | string[]>;
  sessionIndex: string | null;
  issuer: string;
}

export type EventMap = {
  onLoginSuccess: { nameId: string; issuer: string; sessionIndex: string };
  onLoginFailed: { error: string; issuer: string };
};

type Listener<T> = (event: T) => void;

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractAttribute(xml: string, attr: string): string | null {
  const regex = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const match = xml.match(regex);
  return match ? match[1] : null;
}

function extractAllBetween(xml: string, tag: string): string[] {
  const regex = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "gi");
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractSelfClosingOrContent(xml: string, tag: string): { attrs: Record<string, string>; content: string | null }[] {
  const regex = new RegExp(`<(?:[\\w-]+:)?${tag}([^>]*)(?:>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>|/>)`, "gi");
  const results: { attrs: Record<string, string>; content: string | null }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const attrStr = match[1] || "";
    const content = match[2]?.trim() ?? null;
    const attrs: Record<string, string> = {};
    const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    results.push({ attrs, content });
  }
  return results;
}

export class SamlAuth {
  private config: SamlConfig;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: SamlConfig) {
    if (!config.entityId) throw new Error("entityId is required");
    if (!config.acsUrl) throw new Error("acsUrl is required");
    if (!config.idpLoginUrl) throw new Error("idpLoginUrl is required");
    if (!config.idpCert) throw new Error("idpCert is required");
    this.config = { ...config };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  generateLoginUrl(relayState?: string): string {
    const id = `_${randomUUID()}`;
    const issueInstant = new Date().toISOString();

    let authnRequest = `<samlp:AuthnRequest
      xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="${id}"
      Version="2.0"
      IssueInstant="${issueInstant}"
      Destination="${this.config.idpLoginUrl}"
      AssertionConsumerServiceURL="${this.config.acsUrl}"
      ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
      <saml:Issuer>${this.config.entityId}</saml:Issuer>
      <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
    </samlp:AuthnRequest>`;

    if (this.config.privateKey) {
      const sign = createSign("RSA-SHA256");
      sign.update(authnRequest);
      const signature = sign.sign(this.config.privateKey, "base64");
      authnRequest = authnRequest.replace(
        "</saml:Issuer>",
        `</saml:Issuer><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI="#${id}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${createHash("sha256").update(authnRequest).digest("base64")}</ds:DigestValue></ds:Reference></ds:SignedInfo><ds:SignatureValue>${signature}</ds:SignatureValue></ds:Signature>`,
      );
    }

    const encoded = Buffer.from(authnRequest, "utf-8").toString("base64");
    const url = new URL(this.config.idpLoginUrl);
    url.searchParams.set("SAMLRequest", encoded);
    if (relayState) url.searchParams.set("RelayState", relayState);
    return url.toString();
  }

  async validateResponse(samlResponseB64: string): Promise<SamlUser> {
    let xml: string;
    try {
      xml = Buffer.from(samlResponseB64, "base64").toString("utf-8");
    } catch {
      const error = "Invalid base64 SAML response";
      this.emit("onLoginFailed", { error, issuer: "unknown" });
      throw new Error(error);
    }

    const issuer = extractTag(xml, "Issuer") ?? "unknown";

    // Verify signature
    const signatureValue = extractTag(xml, "SignatureValue");
    if (signatureValue) {
      const signedInfoMatch = xml.match(/<(?:[\w-]+:)?SignedInfo[^>]*>[\s\S]*?<\/(?:[\w-]+:)?SignedInfo>/i);
      if (signedInfoMatch) {
        const verify = createVerify("RSA-SHA256");
        verify.update(signedInfoMatch[0]);
        const valid = verify.verify(this.config.idpCert, signatureValue, "base64");
        if (!valid) {
          const error = "SAML response signature verification failed";
          this.emit("onLoginFailed", { error, issuer });
          throw new Error(error);
        }
      }
    }

    // Check status
    const statusCode = xml.match(/StatusCode\s+Value="([^"]*)"/i);
    if (statusCode && !statusCode[1].includes("Success")) {
      const error = `SAML authentication failed with status: ${statusCode[1]}`;
      this.emit("onLoginFailed", { error, issuer });
      throw new Error(error);
    }

    // Check conditions (NotBefore, NotOnOrAfter)
    const conditionsMatch = xml.match(/<(?:[\w-]+:)?Conditions([^>]*)>/i);
    if (conditionsMatch) {
      const condAttrs = conditionsMatch[1];
      const notBefore = extractAttribute(condAttrs, "NotBefore");
      const notOnOrAfter = extractAttribute(condAttrs, "NotOnOrAfter");
      const now = new Date();

      if (notBefore && new Date(notBefore) > now) {
        const error = "SAML assertion is not yet valid";
        this.emit("onLoginFailed", { error, issuer });
        throw new Error(error);
      }
      if (notOnOrAfter && new Date(notOnOrAfter) <= now) {
        const error = "SAML assertion has expired";
        this.emit("onLoginFailed", { error, issuer });
        throw new Error(error);
      }
    }

    // Extract NameID
    const nameId = extractTag(xml, "NameID");
    if (!nameId) {
      const error = "No NameID found in SAML response";
      this.emit("onLoginFailed", { error, issuer });
      throw new Error(error);
    }

    // Extract SessionIndex
    const sessionIndexMatch = xml.match(/SessionIndex="([^"]*)"/i);
    const sessionIndex = sessionIndexMatch ? sessionIndexMatch[1] : null;

    // Extract Attributes
    const attributes: Record<string, string | string[]> = {};
    const attrStatements = extractSelfClosingOrContent(xml, "Attribute");
    for (const attr of attrStatements) {
      const name = attr.attrs.Name || attr.attrs.FriendlyName;
      if (!name) continue;
      const values = extractAllBetween(attr.content ?? "", "AttributeValue");
      attributes[name] = values.length === 1 ? values[0] : values;
    }

    const user: SamlUser = { nameId, attributes, sessionIndex, issuer };

    this.emit("onLoginSuccess", {
      nameId,
      issuer,
      sessionIndex: sessionIndex ?? "",
    });

    return user;
  }

  getMetadata(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${this.config.entityId}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="${this.config.privateKey ? "true" : "false"}"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${this.config.acsUrl}"
      index="0"
      isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  logout(nameId: string, sessionIndex: string): string {
    const id = `_${randomUUID()}`;
    const issueInstant = new Date().toISOString();

    const logoutRequest = `<samlp:LogoutRequest
      xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
      xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
      ID="${id}"
      Version="2.0"
      IssueInstant="${issueInstant}"
      Destination="${this.config.idpLoginUrl}">
      <saml:Issuer>${this.config.entityId}</saml:Issuer>
      <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${nameId}</saml:NameID>
      <samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>
    </samlp:LogoutRequest>`;

    const encoded = Buffer.from(logoutRequest, "utf-8").toString("base64");
    const url = new URL(this.config.idpLoginUrl);
    url.searchParams.set("SAMLRequest", encoded);
    return url.toString();
  }
}

export default SamlAuth;
