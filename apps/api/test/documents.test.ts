import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";

describe("Stage 5 document artifact routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createProject(): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        clientName: "Acme Corporation",
        businessDomain: "Logistics",
        rawIdeaText: "A shipment tracking platform",
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().data.id;
  }

  it("lists documents for a project and fetches a single artifact with content", async () => {
    const projectId = await createProject();

    const createDoc = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: { type: "BRD", contentMarkdown: "# Business Requirements Document" },
    });
    expect(createDoc.statusCode).toBe(201);
    const document = createDoc.json().data;
    expect(document.version).toBe(1);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/documents`,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(1);
    expect(listResponse.json().data[0].type).toBe("BRD");

    const singleResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/documents/${document.id}`,
    });
    expect(singleResponse.statusCode).toBe(200);
    expect(singleResponse.json().data.id).toBe(document.id);
    expect(singleResponse.json().data.contentMarkdown).toBe("# Business Requirements Document");
  });

  it("stores explicit versions and lists all artifacts and versions", async () => {
    const projectId = await createProject();

    const v1 = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: { type: "SRS", contentMarkdown: "# v1", version: 1 },
    });
    expect(v1.statusCode).toBe(201);

    const v2 = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/documents`,
      payload: { type: "SRS", contentMarkdown: "# v2", version: 2 },
    });
    expect(v2.statusCode).toBe(201);
    expect(v2.json().data.version).toBe(2);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/documents`,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data).toHaveLength(2);
    expect(listResponse.json().data.map((d: { version: number }) => d.version).sort()).toEqual([1, 2]);
  });

  it("returns 404 for a document that does not exist", async () => {
    const projectId = await createProject();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/documents/nonexistent-doc-id`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Document not found" });
  });

  it("scopes a document fetch to its own project", async () => {
    const projectA = await createProject();
    const projectB = await createProject();

    const createDoc = await app.inject({
      method: "POST",
      url: `/api/projects/${projectA}/documents`,
      payload: { type: "BRD", contentMarkdown: "# Secret" },
    });
    const document = createDoc.json().data;

    const crossProject = await app.inject({
      method: "GET",
      url: `/api/projects/${projectB}/documents/${document.id}`,
    });
    expect(crossProject.statusCode).toBe(404);
  });

  it("lists review notes for a project", async () => {
    const projectId = await createProject();

    const response = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/review-notes`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });
});
