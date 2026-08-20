import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("project CRUD routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns a healthy status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("rejects an invalid project body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { clientName: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request body" });
  });

  it("creates and lists a project", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        clientName: "Acme Corporation",
        businessDomain: "Logistics",
        rawIdeaText: "A shipment tracking platform",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json().data;
    expect(created.clientName).toBe("Acme Corporation");
    expect(created.status).toBe("intake");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/projects",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(1);
    expect(listResponse.json().data[0].id).toBe(created.id);
  });

  it("creates and reads project requirements, gaps, risks, and documents", async () => {
    const projectResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        clientName: "Acme Corporation",
        businessDomain: "Logistics",
        rawIdeaText: "A shipment tracking platform",
      },
    });
    const projectId = projectResponse.json().data.id;

    const cases = [
      {
        resource: "requirements",
        payload: { type: "functional", text: "Track shipments" },
      },
      {
        resource: "gaps",
        payload: { description: "Carrier API coverage is unknown" },
      },
      {
        resource: "risks",
        payload: {
          description: "Carrier integration may be delayed",
          severity: "medium",
          category: "timeline",
        },
      },
      {
        resource: "documents",
        payload: {
          type: "BRD",
          contentMarkdown: "# Business Requirements",
        },
      },
    ] as const;

    for (const testCase of cases) {
      const createResponse = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/${testCase.resource}`,
        payload: testCase.payload,
      });

      expect(createResponse.statusCode).toBe(201);

      const listResponse = await app.inject({
        method: "GET",
        url: `/api/projects/${projectId}/${testCase.resource}`,
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toHaveLength(1);
    }
  });
});