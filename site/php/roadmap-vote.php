<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$allowedIdeas = [
  'ai-url-templates' => ['up' => 847, 'down' => 31],
  'mobile-video' => ['up' => 612, 'down' => 44],
  'zapier' => ['up' => 541, 'down' => 28],
  'figma-import' => ['up' => 389, 'down' => 36],
  'template-marketplace' => ['up' => 274, 'down' => 22],
];

$votesFile = __DIR__ . '/roadmap-votes.json';

function respond(array $payload, int $status = 200): void
{
  http_response_code($status);
  echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
  exit;
}

function ensureVotesFile(string $file): void
{
  $dir = dirname($file);

  if (!is_dir($dir)) {
    respond([
      'ok' => false,
      'error' => 'Vote directory does not exist.',
      'path' => $dir,
    ], 500);
  }

  if (!file_exists($file)) {
    $created = @file_put_contents($file, json_encode(['votes' => []], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);

    if ($created === false) {
      respond([
        'ok' => false,
        'error' => 'Vote file could not be created. Make the php folder writable by PHP.',
        'path' => $file,
      ], 500);
    }
  }

  if (!is_writable($file)) {
    @chmod($file, 0664);
  }

  if (!is_writable($file)) {
    respond([
      'ok' => false,
      'error' => 'Vote file is not writable by PHP. Set roadmap-votes.json permissions to 664 or 666, and ensure the php folder is writable.',
      'path' => $file,
    ], 500);
  }
}

function clientIp(): string
{
  $candidates = [
    $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '',
    $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '',
    $_SERVER['REMOTE_ADDR'] ?? '',
  ];

  foreach ($candidates as $candidate) {
    $ip = trim(explode(',', $candidate)[0]);

    if (filter_var($ip, FILTER_VALIDATE_IP)) {
      return $ip;
    }
  }

  return 'unknown';
}

function readVoteData(string $file): array
{
  ensureVotesFile($file);

  if (!file_exists($file)) {
    return ['votes' => []];
  }

  $raw = file_get_contents($file);
  $decoded = json_decode($raw ?: '', true);

  if (!is_array($decoded) || !isset($decoded['votes']) || !is_array($decoded['votes'])) {
    return ['votes' => []];
  }

  return $decoded;
}

function writeVoteData(string $file, array $data): void
{
  ensureVotesFile($file);

  $encoded = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

  if ($encoded === false) {
    respond(['ok' => false, 'error' => 'Vote data could not be encoded as JSON.'], 500);
  }

  $written = @file_put_contents($file, $encoded, LOCK_EX);

  if ($written === false) {
    respond([
      'ok' => false,
      'error' => 'Vote file write failed. Check file ownership and write permissions.',
      'path' => $file,
    ], 500);
  }
}

function totals(array $data, array $allowedIdeas): array
{
  $totals = [];

  foreach ($allowedIdeas as $id => $seed) {
    $totals[$id] = [
      'up' => $seed['up'],
      'down' => $seed['down'],
      'score' => $seed['up'] - $seed['down'],
    ];
  }

  foreach ($data['votes'] as $vote) {
    $id = $vote['id'] ?? '';
    $value = $vote['vote'] ?? '';

    if (!isset($totals[$id]) || !in_array($value, ['up', 'down'], true)) {
      continue;
    }

    $totals[$id][$value]++;
    $totals[$id]['score'] = $totals[$id]['up'] - $totals[$id]['down'];
  }

  return $totals;
}

function userVotes(array $data, string $ip): array
{
  $votes = [];

  foreach ($data['votes'] as $vote) {
    if (($vote['ip'] ?? '') !== $ip) {
      continue;
    }

    $id = $vote['id'] ?? '';
    $value = $vote['vote'] ?? '';

    if ($id !== '' && in_array($value, ['up', 'down'], true)) {
      $votes[$id] = $value;
    }
  }

  return $votes;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $data = readVoteData($votesFile);
  $ip = clientIp();

  respond([
    'ok' => true,
    'totals' => totals($data, $allowedIdeas),
    'userVotes' => userVotes($data, $ip),
  ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  respond(['ok' => false, 'error' => 'Method not allowed.'], 405);
}

$payload = json_decode(file_get_contents('php://input') ?: '', true);
$id = is_array($payload) ? (string)($payload['id'] ?? '') : '';
$vote = is_array($payload) ? (string)($payload['vote'] ?? '') : '';

if (!isset($allowedIdeas[$id]) || !in_array($vote, ['up', 'down'], true)) {
  respond(['ok' => false, 'error' => 'Invalid roadmap vote.'], 400);
}

$ip = clientIp();
$data = readVoteData($votesFile);

$data['votes'] = array_values(array_filter($data['votes'], function ($entry) use ($id, $ip) {
  return !(($entry['id'] ?? '') === $id && ($entry['ip'] ?? '') === $ip);
}));

$data['votes'][] = [
  'id' => $id,
  'vote' => $vote,
  'ip' => $ip,
  'userAgent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 240),
  'createdAt' => gmdate('c'),
];

writeVoteData($votesFile, $data);

respond([
  'ok' => true,
  'id' => $id,
  'vote' => $vote,
  'totals' => totals($data, $allowedIdeas),
  'userVotes' => userVotes($data, $ip),
]);
