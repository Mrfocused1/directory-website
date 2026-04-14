import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { visitorProfiles, collections, bookmarks } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/bookmarks?siteId=xxx&email=xxx — Get visitor's collections and bookmarks
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  const email = request.nextUrl.searchParams.get("email");

  if (!siteId || !email) {
    return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json({ collections: [], authenticated: false });
  }

  const visitor = await db.query.visitorProfiles.findFirst({
    where: and(eq(visitorProfiles.siteId, siteId), eq(visitorProfiles.email, email)),
  });

  if (!visitor) {
    return NextResponse.json({ collections: [], authenticated: false });
  }

  const cols = await db.query.collections.findMany({
    where: eq(collections.visitorId, visitor.id),
    with: { },
  });

  // Fetch bookmarks for each collection
  const result = await Promise.all(
    cols.map(async (col) => {
      const bms = await db!.query.bookmarks.findMany({
        where: eq(bookmarks.collectionId, col.id),
      });
      return {
        id: col.id,
        name: col.name,
        emoji: col.emoji,
        isDefault: col.isDefault,
        bookmarks: bms.map((b) => b.postShortcode),
      };
    }),
  );

  return NextResponse.json({ collections: result, authenticated: true });
}

// POST /api/bookmarks — Sign in + bookmark a post, or create a collection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, name, action } = body;

    if (!siteId || !email) {
      return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Get or create visitor
    let visitor = await db.query.visitorProfiles.findFirst({
      where: and(eq(visitorProfiles.siteId, siteId), eq(visitorProfiles.email, email)),
    });

    if (!visitor) {
      const [created] = await db.insert(visitorProfiles).values({
        siteId,
        email,
        name: name || null,
      }).returning();
      visitor = created;

      // Create default collection
      await db.insert(collections).values({
        visitorId: visitor.id,
        siteId,
        name: "Saved",
        emoji: "",
        isDefault: true,
      });
    }

    if (action === "bookmark") {
      const { postShortcode, collectionId } = body;
      if (!postShortcode) {
        return NextResponse.json({ error: "Missing postShortcode" }, { status: 400 });
      }

      // Find target collection
      let col;
      if (collectionId) {
        col = await db.query.collections.findFirst({
          where: and(eq(collections.id, collectionId), eq(collections.visitorId, visitor.id)),
        });
      } else {
        col = await db.query.collections.findFirst({
          where: and(eq(collections.visitorId, visitor.id), eq(collections.isDefault, true)),
        });
      }

      if (!col) {
        return NextResponse.json({ error: "Collection not found" }, { status: 404 });
      }

      // Check if already bookmarked — toggle
      const existing = await db.query.bookmarks.findFirst({
        where: and(eq(bookmarks.collectionId, col.id), eq(bookmarks.postShortcode, postShortcode)),
      });

      if (existing) {
        await db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
        return NextResponse.json({ bookmarked: false, collection: col.id });
      } else {
        await db.insert(bookmarks).values({
          collectionId: col.id,
          postShortcode,
        });
        return NextResponse.json({ bookmarked: true, collection: col.id });
      }
    }

    if (action === "create_collection") {
      const { collectionName, emoji } = body;
      if (!collectionName?.trim()) {
        return NextResponse.json({ error: "Missing collection name" }, { status: 400 });
      }

      const [newCol] = await db.insert(collections).values({
        visitorId: visitor.id,
        siteId,
        name: collectionName.trim(),
        emoji: emoji || "",
        isDefault: false,
      }).returning();

      return NextResponse.json({
        collection: {
          id: newCol.id,
          name: newCol.name,
          emoji: newCol.emoji,
          isDefault: newCol.isDefault,
          bookmarks: [],
        },
      }, { status: 201 });
    }

    if (action === "move_bookmark") {
      const { postShortcode, fromCollectionId, toCollectionId } = body;

      // Remove from source
      await db.delete(bookmarks).where(
        and(eq(bookmarks.collectionId, fromCollectionId), eq(bookmarks.postShortcode, postShortcode)),
      );

      // Add to destination (ignore if already there)
      const existingInTarget = await db.query.bookmarks.findFirst({
        where: and(eq(bookmarks.collectionId, toCollectionId), eq(bookmarks.postShortcode, postShortcode)),
      });
      if (!existingInTarget) {
        await db.insert(bookmarks).values({
          collectionId: toCollectionId,
          postShortcode,
        });
      }

      return NextResponse.json({ moved: true });
    }

    // Default: sign in / return profile
    const cols = await db.query.collections.findMany({
      where: eq(collections.visitorId, visitor.id),
    });
    const result = await Promise.all(
      cols.map(async (col) => {
        const bms = await db!.query.bookmarks.findMany({
          where: eq(bookmarks.collectionId, col.id),
        });
        return {
          id: col.id,
          name: col.name,
          emoji: col.emoji,
          isDefault: col.isDefault,
          bookmarks: bms.map((b) => b.postShortcode),
        };
      }),
    );

    return NextResponse.json({ authenticated: true, collections: result });
  } catch (err) {
    console.error("[bookmarks] Error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE /api/bookmarks — Remove a collection
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, collectionId } = body;

    if (!siteId || !email || !collectionId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Only delete non-default collections owned by this visitor
    const visitor = await db.query.visitorProfiles.findFirst({
      where: and(eq(visitorProfiles.siteId, siteId), eq(visitorProfiles.email, email)),
    });
    if (!visitor) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(collections).where(
      and(
        eq(collections.id, collectionId),
        eq(collections.visitorId, visitor.id),
        eq(collections.isDefault, false),
      ),
    );

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[bookmarks] Delete error:", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
