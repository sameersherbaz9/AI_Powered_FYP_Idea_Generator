-- ============================================================
-- FYP Idea Generator — Final Optimized Database Schema
-- ============================================================
-- users and students tables are MERGED into one `users` table.
-- There is only one type of user (student) so no role column needed.
-- Total tables: 5
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `fyp_generator`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `fyp_generator`;

-- ------------------------------------------------------------
-- 1. users  (merged users + students — single student table)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `students` (
  `id`               int(11)      NOT NULL AUTO_INCREMENT,
  `full_name`        varchar(255) NOT NULL,
  `email`            varchar(255) NOT NULL,
  `password`         varchar(255) NOT NULL,
  `reg_number`       varchar(50)  DEFAULT NULL,
  `department`       varchar(100) DEFAULT NULL,
  `current_semester` int(11)      NOT NULL DEFAULT 1,
  `cgpa`             decimal(3,2) NOT NULL DEFAULT 0.00,
  `area_of_interest` text         DEFAULT NULL,
  `reset_token`         varchar(255) DEFAULT NULL,
  `reset_token_expires` datetime     DEFAULT NULL,
  `created_at`       timestamp    NOT NULL DEFAULT current_timestamp(),
  `updated_at`       timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`),
  UNIQUE KEY `uq_reg_number` (`reg_number`),
  KEY `idx_department` (`department`),
  KEY `idx_reset_token` (`reset_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. email_verifications  (no FK — user does not exist yet at OTP time)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `email_verifications` (
  `id`         int(11)      NOT NULL AUTO_INCREMENT,
  `email`      varchar(255) NOT NULL,
  `otp`        varchar(6)   NOT NULL,
  `expires_at` datetime     NOT NULL,
  `verified`   tinyint(1)   NOT NULL DEFAULT 0,
  `created_at` timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_email_otp` (`email`, `otp`),
  KEY `idx_email_created` (`email`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------
-- 3. activity_logs  (depends on: users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id`         int(11)      NOT NULL AUTO_INCREMENT,
  `user_id`    int(11)      NOT NULL,
  `action`     varchar(100) NOT NULL,
  `details`    text         DEFAULT NULL,
  `ip_address` varchar(45)  DEFAULT NULL,
  `created_at` timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_activity_logs_user` FOREIGN KEY (`user_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. student_projects  (depends on: users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_projects` (
  `id`                  int(11)      NOT NULL AUTO_INCREMENT,
  `student_id`          int(11)      NOT NULL,
  `semester_number`     int(11)      NOT NULL,
  `course_name`         varchar(255) NOT NULL,
  `project_name`        varchar(255) NOT NULL,
  `project_description` longtext     NOT NULL,
  `languages`           varchar(255) DEFAULT '',
  `frontend_frameworks` varchar(255) DEFAULT '',
  `backend_frameworks`  varchar(255) DEFAULT '',
  `created_at`          timestamp    NOT NULL DEFAULT current_timestamp(),
  `updated_at`          timestamp    NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_student_projects_user` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. saved_ideas  (depends on: users)
--    Stores idea data directly — always fresh from Groq, never cached.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saved_ideas` (
  `id`               int(11)      NOT NULL AUTO_INCREMENT,
  `student_id`       int(11)      NOT NULL,
  `idea_title`       varchar(255) NOT NULL,
  `idea_description` text         DEFAULT NULL,
  `idea_category`    varchar(100) DEFAULT 'AI-Generated',
  `idea_technologies`text         DEFAULT NULL,
  `idea_difficulty`  enum('Beginner','Intermediate','Advanced') DEFAULT 'Intermediate',
  `idea_trend`       varchar(255) DEFAULT NULL,
  `saved_at`         timestamp    NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_idea_title` (`student_id`, `idea_title`(100)),
  KEY `idx_student_id` (`student_id`),
  CONSTRAINT `fk_saved_ideas_user` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- MIGRATION — run this ONLY if you already have an existing
-- `students` table created before the reset_token columns were
-- added above (i.e. you don't want to drop/recreate the table).
-- Safe to run multiple times.
-- ============================================================
-- ALTER TABLE `students`
--   ADD COLUMN IF NOT EXISTS `reset_token` varchar(255) DEFAULT NULL,
--   ADD COLUMN IF NOT EXISTS `reset_token_expires` datetime DEFAULT NULL,
--   ADD INDEX IF NOT EXISTS `idx_reset_token` (`reset_token`);
