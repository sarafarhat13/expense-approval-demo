<?php
/**
 * Traqspera Expense API — single-file backend.
 *
 *   GET  ./api/expenses.php            → list expenses (JSON array)
 *   GET  ./api/expenses.php?ping=1     → simple health check
 *   POST ./api/expenses.php            → update one expense
 *        body: { id, status, audit }   (audit is the full updated array)
 *   POST ./api/expenses.php?reset=1    → re-seed from ../assets/data/expenses.json
 *
 * Storage: SQLite database at ./data/expenses.sqlite.
 * On first request the DB is created and seeded from the JSON file used by
 * the front-end demo, so the same dataset shows up regardless of mode.
 */

declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ----- DB bootstrap --------------------------------------------------------

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}

$dbPath = $dataDir . '/expenses.sqlite';
$seedPath = __DIR__ . '/../assets/data/expenses.json';

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database unavailable']);
    exit;
}

$pdo->exec('
    CREATE TABLE IF NOT EXISTS expenses (
        id            TEXT PRIMARY KEY,
        employee_json TEXT NOT NULL,
        description   TEXT NOT NULL,
        submit_date   TEXT NOT NULL,
        category      TEXT NOT NULL,
        department    TEXT NOT NULL,
        job_and_phase TEXT NOT NULL,
        total         REAL NOT NULL,
        report        TEXT,
        status        TEXT NOT NULL CHECK (status IN ("Pending","Approved","Declined")),
        receipts      INTEGER NOT NULL DEFAULT 0,
        audit_json    TEXT NOT NULL DEFAULT "[]",
        updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
');

function seedFromJson(PDO $pdo, string $seedPath): void {
    if (!is_file($seedPath)) return;
    $rows = json_decode((string) file_get_contents($seedPath), true);
    if (!is_array($rows)) return;

    $pdo->exec('DELETE FROM expenses');
    $stmt = $pdo->prepare('
        INSERT INTO expenses (
            id, employee_json, description, submit_date, category, department,
            job_and_phase, total, report, status, receipts, audit_json
        ) VALUES (
            :id, :employee, :description, :submit_date, :category, :department,
            :job_and_phase, :total, :report, :status, :receipts, :audit
        )
    ');

    foreach ($rows as $r) {
        $stmt->execute([
            ':id'            => $r['id'],
            ':employee'      => json_encode($r['employee']),
            ':description'   => $r['description'],
            ':submit_date'   => $r['submitDate'],
            ':category'      => $r['category'],
            ':department'    => $r['department'],
            ':job_and_phase' => $r['jobAndPhase'],
            ':total'         => $r['total'],
            ':report'        => $r['report'] ?? null,
            ':status'        => $r['status'],
            ':receipts'      => $r['receipts'] ?? 0,
            ':audit'         => json_encode($r['audit'] ?? []),
        ]);
    }
}

// Auto-seed an empty database on first request.
$count = (int) $pdo->query('SELECT COUNT(*) FROM expenses')->fetchColumn();
if ($count === 0) {
    seedFromJson($pdo, $seedPath);
}

// ----- helpers -------------------------------------------------------------

function rowToApi(array $row): array {
    return [
        'id'          => $row['id'],
        'employee'    => json_decode($row['employee_json'], true),
        'description' => $row['description'],
        'submitDate'  => $row['submit_date'],
        'category'    => $row['category'],
        'department'  => $row['department'],
        'jobAndPhase' => $row['job_and_phase'],
        'total'       => (float) $row['total'],
        'report'      => $row['report'],
        'status'      => $row['status'],
        'receipts'    => (int) $row['receipts'],
        'audit'       => json_decode($row['audit_json'] ?: '[]', true),
    ];
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ----- routing -------------------------------------------------------------

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (isset($_GET['ping'])) {
        echo json_encode(['ok' => true, 'service' => 'traqspera-expenses']);
        exit;
    }

    $rows = $pdo->query('SELECT * FROM expenses ORDER BY submit_date DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(array_map('rowToApi', $rows));
    exit;
}

if ($method === 'POST') {
    if (isset($_GET['reset'])) {
        seedFromJson($pdo, $seedPath);
        echo json_encode(['ok' => true, 'reseeded' => true]);
        exit;
    }

    $body = readJsonBody();
    $id = $body['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'id is required']);
        exit;
    }

    // Build update fragments dynamically so we only touch what we received.
    $sets = [];
    $params = [':id' => $id];

    if (isset($body['status'])) {
        if (!in_array($body['status'], ['Pending', 'Approved', 'Declined'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid status']);
            exit;
        }
        $sets[] = 'status = :status';
        $params[':status'] = $body['status'];
    }

    if (array_key_exists('audit', $body)) {
        if (!is_array($body['audit'])) {
            http_response_code(400);
            echo json_encode(['error' => 'audit must be an array']);
            exit;
        }
        $sets[] = 'audit_json = :audit';
        $params[':audit'] = json_encode($body['audit']);
    }

    if (!$sets) {
        http_response_code(400);
        echo json_encode(['error' => 'Nothing to update']);
        exit;
    }

    $sets[] = 'updated_at = CURRENT_TIMESTAMP';
    $sql = 'UPDATE expenses SET ' . implode(', ', $sets) . ' WHERE id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if ($stmt->rowCount() === 0) {
        http_response_code(404);
        echo json_encode(['error' => 'Expense not found']);
        exit;
    }

    $row = $pdo->prepare('SELECT * FROM expenses WHERE id = :id');
    $row->execute([':id' => $id]);
    $r = $row->fetch(PDO::FETCH_ASSOC);
    echo json_encode(rowToApi($r));
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
