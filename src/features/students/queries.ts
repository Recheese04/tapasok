import "server-only";
import { db } from "@/lib/database/client";
import { assertSystemPermission } from "@/lib/permissions";
import { PAGE_SIZE } from "@/components/shared/pagination";

// Student data is sensitive: every query re-checks the permission and selects explicit fields.

export async function listStudents(search: string | undefined, page: number) {
  await assertSystemPermission("students.manage");
  const q = search?.trim().slice(0, 100);
  const where = q
    ? {
        OR: [
          { studentNumber: { contains: q, mode: "insensitive" as const } },
          { user: { firstName: { contains: q, mode: "insensitive" as const } } },
          { user: { lastName: { contains: q, mode: "insensitive" as const } } },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    db.studentProfile.count({ where }),
    db.studentProfile.findMany({
      where,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        studentNumber: true, yearLevel: true, cityName: true, program: { select: { code: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
      },
    }),
  ]);
  return { total, rows };
}

export async function getStudent(userId: string) {
  await assertSystemPermission("students.manage");
  return db.studentProfile.findUnique({
    where: { userId },
    select: {
      studentNumber: true, middleName: true, programId: true, rfidUid: true, photoKey: true, yearLevel: true, contactNumber: true,
      program: { select: { name: true, department: { select: { id: true, collegeId: true } } } },
      streetAddress: true, regionCode: true, provinceCode: true, cityCode: true, barangayCode: true,
      regionName: true, provinceName: true, cityName: true, barangayName: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
    },
  });
}
