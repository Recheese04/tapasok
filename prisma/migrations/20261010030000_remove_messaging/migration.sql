-- DropForeignKey
ALTER TABLE "message_threads" DROP CONSTRAINT "message_threads_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "message_threads" DROP CONSTRAINT "message_threads_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_participants" DROP CONSTRAINT "thread_participants_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_participants" DROP CONSTRAINT "thread_participants_user_id_fkey";

-- DropTable
DROP TABLE "message_threads";

-- DropTable
DROP TABLE "messages";

-- DropTable
DROP TABLE "thread_participants";

-- DropEnum
DROP TYPE "ThreadKind";

