<?php

declare(strict_types=1);

// Start a session to store the CAPTCHA and rate limiting data.
session_start();

// Prevent browsers from caching CAPTCHA responses.
header('Cache-Control: no-store');

// Configuration constants.
const SUPPORT_EMAIL = 'support@themecresthq.xyz';
const RATE_LIMIT_WINDOW = 60; // Time window in seconds.
const RATE_LIMIT_MAX = 3; // Maximum submissions allowed per window.
const CAPTCHA_KEY = 'zoroslider_support_captcha_answer';
const CAPTCHA_QUESTION_KEY = 'zoroslider_support_captcha_question';

// Validation limits for each form field.
const FIELD_LIMITS = [
  'fullname' => ['min' => 2, 'max' => 100],
  'email' => ['min' => 5, 'max' => 254],
  'email2' => ['min' => 5, 'max' => 254],
  'subject' => ['min' => 5, 'max' => 150],
  'message' => ['min' => 20, 'max' => 3000],
  'captcha_answer' => ['min' => 1, 'max' => 6],
];

/**
 * Sends a JSON response and immediately terminates the request.
 */
function respond(array $payload, int $status = 200): void
{
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

/**
 * Attempts to determine the visitor's real IP address.
 *
 * Checks common reverse proxy and CDN headers before falling
 * back to REMOTE_ADDR.
 */
function clientIp(): string
{
  foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP'] as $key) {
    $ip = trim(explode(',', $_SERVER[$key] ?? '')[0]);

    if (filter_var($ip, FILTER_VALIDATE_IP)) {
      return $ip;
    }
  }

  foreach (explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '') as $candidate) {
    $ip = trim($candidate);

    if (filter_var($ip, FILTER_VALIDATE_IP)) {
      return $ip;
    }
  }

  return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

/**
 * Generates a simple math CAPTCHA and stores both the
 * question and answer in the current session.
 */
function generateCaptcha(): string
{
  $a = random_int(2, 12);
  $b = random_int(1, 9);
  $answer = $a + $b;
  $question = $a . ' + ' . $b . ' = ?';

  $_SESSION[CAPTCHA_KEY] = $answer;
  $_SESSION[CAPTCHA_QUESTION_KEY] = $question;

  return $question;
}

/**
 * Determines whether the current IP has exceeded the
 * allowed number of submissions within the configured window.
 */
function isRateLimited(string $ip): bool
{
  $now = time();

  // Retrieve previously recorded submissions.
  $records = $_SESSION['zoroslider_support_rate_limit'] ?? [];

  // Remove expired entries.
  $records = array_values(array_filter(
    $records,
    fn($record) => ($now - ($record['time'] ?? 0)) <= RATE_LIMIT_WINDOW
  ));

  // Count submissions from the current IP.
  $count = count(array_filter(
    $records,
    fn($record) => ($record['ip'] ?? '') === $ip
  ));

  // Save the cleaned list back into the session.
  $_SESSION['zoroslider_support_rate_limit'] = $records;

  return $count >= RATE_LIMIT_MAX;
}

/**
 * Records a successful submission for rate limiting.
 */
function recordSubmission(string $ip): void
{
  $_SESSION['zoroslider_support_rate_limit'][] = [
    'ip' => $ip,
    'time' => time(),
  ];
}

// A GET request is used by the frontend to retrieve a fresh CAPTCHA
// and the validation limits.
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  respond([
    'ok' => true,
    'question' => generateCaptcha(),
    'limits' => FIELD_LIMITS,
  ]);
}

// Only POST requests are accepted for form submission.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  respond(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$ip = clientIp();

// Prevent excessive submissions from the same visitor.
if (isRateLimited($ip)) {
  respond([
    'ok' => false,
    'errors' => [
      'global' => 'Too many support requests. Please wait a moment before trying again.',
    ],
  ], 429);
}

$limits = FIELD_LIMITS;

// Trim, sanitize and limit all incoming values before validation.
$fullname = mb_substr(strip_tags(trim($_POST['fullname'] ?? '')), 0, $limits['fullname']['max']);
$email = mb_substr(trim($_POST['email'] ?? ''), 0, $limits['email']['max']);
$email2 = mb_substr(trim($_POST['email2'] ?? ''), 0, $limits['email2']['max']);
$subject = mb_substr(strip_tags(trim($_POST['subject'] ?? '')), 0, $limits['subject']['max']);
$message = mb_substr(strip_tags(trim($_POST['message'] ?? '')), 0, $limits['message']['max']);
$captcha = mb_substr(trim($_POST['captcha_answer'] ?? ''), 0, $limits['captcha_answer']['max']);

$errors = [];

// Validate the user's name.
if ($fullname === '' || mb_strlen($fullname) < $limits['fullname']['min']) {
  $errors['fullname'] = 'Please enter your full name.';
}

// Validate the primary email address.
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  $errors['email'] = 'Please enter a valid email address.';
}

// Validate the confirmation email address.
if ($email2 === '' || !filter_var($email2, FILTER_VALIDATE_EMAIL)) {
  $errors['email2'] = 'Please enter a valid email2 address.';
}

// Compare both email fields only after each one is valid.
if (
  !isset($errors['email']) &&
  !isset($errors['email2']) &&
  strcasecmp(trim($email), trim($email2)) !== 0
) {
  $errors['email2'] = 'Email addresses do not match.';
}

// Validate the subject.
if ($subject === '' || mb_strlen($subject) < $limits['subject']['min']) {
  $errors['subject'] = 'Please enter a clear subject.';
}

// Validate the support message.
if ($message === '' || mb_strlen($message) < $limits['message']['min']) {
  $errors['message'] = 'Please describe the issue in more detail.';
}

// Verify the CAPTCHA answer and generate a new challenge if incorrect.
if (
  !isset($_SESSION[CAPTCHA_KEY]) ||
  !ctype_digit($captcha) ||
  (int)$captcha !== (int)$_SESSION[CAPTCHA_KEY]
) {
  $errors['captcha'] = 'The security answer is incorrect.';
  generateCaptcha();
}

// Return all validation errors without sending the email.
if ($errors) {
  respond([
    'ok' => false,
    'errors' => $errors,
    'question' => $_SESSION[CAPTCHA_QUESTION_KEY] ?? generateCaptcha(),
  ], 422);
}

// Build the email.
$mailSubject = '[ZoroSlider Support] ' . mb_substr($subject, 0, 100);

$body = implode("\n", [
  'New support request from the ZoroSlider demo site.',
  str_repeat('-', 50),
  'Name: ' . $fullname,
  'Email: ' . $email,
  'Subject: ' . $subject,
  'IP: ' . $ip,
  '',
  'Message:',
  $message,
]);

// Configure email headers.
$headers = "From: ZoroSlider Support <no-reply@themecresthq.xyz>\r\n";
$headers .= 'Reply-To: ' . $fullname . ' <' . $email . ">\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

// Send the support email.
if (!mail(SUPPORT_EMAIL, $mailSubject, $body, $headers)) {
  respond([
    'ok' => false,
    'errors' => [
      'global' => 'Mail delivery failed. Please try again later or contact support directly.',
    ],
  ], 500);
}

// Record the successful submission.
recordSubmission($ip);

// Invalidate the current CAPTCHA so it cannot be reused.
unset($_SESSION[CAPTCHA_KEY], $_SESSION[CAPTCHA_QUESTION_KEY]);

// Inform the frontend that the submission succeeded.
respond([
  'ok' => true,
  'message' => 'Your support request has been sent. We will reply as soon as possible.',
]);
