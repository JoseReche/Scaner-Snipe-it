package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

type App struct {
	db             *sql.DB
	jwtSecret      []byte
	encryptionKey  []byte
	snipeURL       string
	snipeWebURL    string
	defaultPAField string
	httpClient     *http.Client
	authLogPath    string
}

type Claims struct {
	Matricula string `json:"matricula"`
	jwt.RegisteredClaims
}

type User struct {
	Matricula       string
	PasswordHash    string
	APIKeyEncrypted string
}

func main() {
	_ = loadDotEnv(".env")

	dbPath := env("USERS_DB_PATH", "src/data/users.sqlite")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatalf("erro ao criar diretório do banco: %v", err)
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("erro ao abrir sqlite: %v", err)
	}
	defer db.Close()

	if err := initDB(db); err != nil {
		log.Fatalf("erro ao inicializar banco: %v", err)
	}

	jwtSecret := []byte(env("JWT_SECRET", "change-me"))
	encryptionKey := []byte(env("ENCRYPTION_KEY", "01234567890123456789012345678901"))
	if len(encryptionKey) != 16 && len(encryptionKey) != 24 && len(encryptionKey) != 32 {
		log.Fatalf("ENCRYPTION_KEY deve ter 16, 24 ou 32 bytes")
	}

	snipeURL := strings.TrimRight(env("SNIPE_URL", "https://SEU-SNIPE/api/v1"), "/")
	snipeWebURL := strings.TrimSuffix(strings.TrimSuffix(snipeURL, "/api/v1"), "/api/v2")

	app := &App{
		db:             db,
		jwtSecret:      jwtSecret,
		encryptionKey:  encryptionKey,
		snipeURL:       snipeURL,
		snipeWebURL:    snipeWebURL,
		defaultPAField: env("SNIPE_PA_FIELD_KEY", "_snipeit_pa_6"),
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		authLogPath:    env("AUTH_LOG_PATH", "src/data/auth.log"),
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/", serveHTML("src/public/login.html"))
	r.Get("/login", serveHTML("src/public/login.html"))
	r.Get("/register", serveHTML("src/public/register.html"))
	r.Get("/dashboard", serveHTML("src/public/dashboard.html"))
	r.Get("/scanner", serveHTML("src/public/scanner.html"))
	r.Get("/scanner-pa", serveHTML("src/public/scanner-pa.html"))
	r.Get("/usuario", serveHTML("src/public/usuario.html"))
	r.Get("/change-password", serveHTML("src/public/change-password.html"))
	r.Get("/home-office", serveHTML("src/public/home-office.html"))
	r.Get("/retorno-home-office", serveHTML("src/public/retorno-home-office.html"))
	r.Handle("/*", http.FileServer(http.Dir("src/public")))

	r.Route("/api/auth", func(ar chi.Router) {
		ar.Post("/register", app.handleRegister)
		ar.Post("/login", app.handleLogin)
		ar.Group(func(pr chi.Router) {
			pr.Use(app.authMiddleware)
			pr.Post("/change-password", app.handleChangePassword)
		})
	})

	r.Group(func(pr chi.Router) {
		pr.Use(app.authMiddleware)
		pr.Get("/asset/{id}", app.handleGetAsset)
		pr.Get("/api/sipe/hardware/{id}", app.handleGetAsset)
		pr.Get("/api/sipe/asset/{id}", app.handleGetAsset)
		pr.Get("/move-info", app.handleMoveInfo)
		pr.Post("/move", app.handleMove)
		pr.Patch("/asset/{id}", app.handlePatchAsset)
		pr.Get("/options", app.handleOptions)
		pr.Post("/checkout", app.handleCheckout)
		pr.Post("/home-office/termo", app.handleUploadTerm)
	})

	port := env("PORT", "3000")
	log.Printf("Servidor Go rodando na porta %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}

func (a *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Matricula string `json:"matricula"`
		Password  string `json:"password"`
		APIKey    string `json:"api_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}
	body.Matricula = strings.TrimSpace(body.Matricula)
	if body.Matricula == "" || len(body.Password) < 6 || strings.TrimSpace(body.APIKey) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "matricula, password e api_key são obrigatórios"})
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	encrypted, err := encryptAPIKey(a.encryptionKey, body.APIKey)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao criptografar API key"})
		return
	}

	_, err = a.db.Exec(`INSERT INTO users (matricula, password_hash, api_key_encrypted) VALUES (?, ?, ?)`, body.Matricula, string(hash), encrypted)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "matrícula já cadastrada"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao salvar usuário"})
		return
	}

	a.logAuth("register", body.Matricula, "success")
	writeJSON(w, http.StatusCreated, map[string]bool{"success": true})
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Matricula string `json:"matricula"`
		Password  string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}
	user, err := a.findUserByMatricula(strings.TrimSpace(body.Matricula))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "credenciais inválidas"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)) != nil {
		a.logAuth("login", body.Matricula, "invalid_password")
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "credenciais inválidas"})
		return
	}

	token, err := a.createToken(user.Matricula)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao gerar token"})
		return
	}
	a.logAuth("login", body.Matricula, "success")
	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}

func (a *App) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	matricula := r.Context().Value("matricula").(string)
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}
	user, err := a.findUserByMatricula(matricula)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "senha atual inválida"})
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	_, err = a.db.Exec(`UPDATE users SET password_hash = ? WHERE matricula = ?`, string(hash), matricula)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao atualizar senha"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (a *App) handleGetAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	var resp map[string]any
	if err := a.snipeJSON(r.Context(), http.MethodGet, "/hardware/"+id, nil, headers, &resp); err != nil {
		writeJSON(w, statusFromErr(err), map[string]string{"error": "erro ao buscar ativo"})
		return
	}
	writeJSON(w, http.StatusOK, mapAsset(resp))
}

func (a *App) handleMoveInfo(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("asset")
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Informe o parâmetro asset"})
		return
	}
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	var resp map[string]any
	if err := a.snipeJSON(r.Context(), http.MethodGet, "/hardware/"+id, nil, headers, &resp); err != nil {
		writeJSON(w, statusFromErr(err), map[string]string{"error": "erro ao buscar dados"})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (a *App) handleMove(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Asset any `json:"asset"`
		PA    any `json:"pa"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	asset := strings.TrimSpace(fmt.Sprint(body.Asset))
	pa := strings.TrimSpace(fmt.Sprint(body.PA))
	if asset == "" || pa == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Campos asset e pa são obrigatórios"})
		return
	}
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	payload := map[string]any{a.defaultPAField: pa}
	if err := a.snipeJSON(r.Context(), http.MethodPatch, "/hardware/"+asset, payload, headers, nil); err != nil {
		writeJSON(w, statusFromErr(err), map[string]string{"error": "Erro ao mover ativo"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (a *App) handlePatchAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, 400, map[string]string{"error": "JSON inválido"})
		return
	}
	if len(body) == 0 {
		writeJSON(w, 400, map[string]string{"error": "Nenhum campo válido para atualizar foi enviado"})
		return
	}
	if err := a.snipeJSON(r.Context(), http.MethodPatch, "/hardware/"+id, body, headers, nil); err != nil {
		writeJSON(w, statusFromErr(err), map[string]string{"error": "Erro ao atualizar ativo"})
		return
	}
	var asset map[string]any
	_ = a.snipeJSON(r.Context(), http.MethodGet, "/hardware/"+id, nil, headers, &asset)
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "asset": mapAsset(asset)})
}

func (a *App) handleOptions(w http.ResponseWriter, r *http.Request) {
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	fetch := func(endpoint string) []map[string]any {
		var out struct {
			Rows []map[string]any `json:"rows"`
		}
		if err := a.snipeJSON(r.Context(), http.MethodGet, "/"+endpoint+"?limit=500&offset=0", nil, headers, &out); err != nil {
			return nil
		}
		return out.Rows
	}
	statuses := fetch("statuslabels")
	locations := fetch("locations")
	companies := fetch("companies")
	users := fetch("users")
	writeJSON(w, 200, map[string]any{"statuses": statuses, "locations": locations, "companies": companies, "users": users})
}

func (a *App) handleCheckout(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	_ = json.NewDecoder(r.Body).Decode(&body)
	asset := strings.TrimSpace(fmt.Sprint(body["asset"]))
	user := strings.TrimSpace(fmt.Sprint(body["user"]))
	if asset == "" || user == "" {
		writeJSON(w, 400, map[string]string{"error": "Campos asset e user são obrigatórios"})
		return
	}
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, 401, map[string]string{"error": err.Error()})
		return
	}
	payload := map[string]any{"checkout_to_type": "user", "assigned_user": user}
	if err := a.snipeJSON(r.Context(), http.MethodPost, "/hardware/"+asset+"/checkout", payload, headers, nil); err != nil {
		writeJSON(w, statusFromErr(err), map[string]string{"error": "Erro no checkout"})
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *App) handleUploadTerm(w http.ResponseWriter, r *http.Request) {
	asset := r.URL.Query().Get("asset")
	if asset == "" {
		writeJSON(w, 400, map[string]string{"error": "Campo asset é obrigatório"})
		return
	}
	pdfBytes, _ := io.ReadAll(io.LimitReader(r.Body, 2*1024*1024+1))
	if len(pdfBytes) == 0 {
		writeJSON(w, 400, map[string]string{"error": "O PDF gerado está vazio"})
		return
	}
	if len(pdfBytes) > 2*1024*1024 {
		writeJSON(w, 413, map[string]string{"error": "O arquivo PDF excede o limite de 2MB do Snipe-IT"})
		return
	}
	headers, err := a.getUserHeaders(r.Context())
	if err != nil {
		writeJSON(w, 401, map[string]string{"error": err.Error()})
		return
	}

	var b strings.Builder
	mw := multipart.NewWriter(&b)
	fw, _ := mw.CreateFormFile("file[]", "termo-home-office-"+asset+".pdf")
	_, _ = fw.Write(pdfBytes)
	_ = mw.Close()

	h := map[string]string{"Authorization": headers["Authorization"], "Content-Type": mw.FormDataContentType(), "Accept": "application/json"}
	if err := a.snipeRaw(r.Context(), http.MethodPost, "/hardware/"+asset+"/files", strings.NewReader(b.String()), h); err != nil {
		writeJSON(w, statusFromErr(err), map[string]string{"error": "Erro ao anexar termo no ativo"})
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func (a *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "token ausente"})
			return
		}
		tok := strings.TrimPrefix(h, "Bearer ")
		parsed, err := jwt.ParseWithClaims(tok, &Claims{}, func(token *jwt.Token) (any, error) { return a.jwtSecret, nil })
		if err != nil || !parsed.Valid {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "token inválido"})
			return
		}
		claims := parsed.Claims.(*Claims)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), "matricula", claims.Matricula)))
	})
}

func (a *App) createToken(matricula string) (string, error) {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{Matricula: matricula, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(3 * time.Hour)), IssuedAt: jwt.NewNumericDate(time.Now())}})
	return t.SignedString(a.jwtSecret)
}

func (a *App) findUserByMatricula(matricula string) (*User, error) {
	u := &User{}
	err := a.db.QueryRow(`SELECT matricula, password_hash, COALESCE(api_key_encrypted, '') FROM users WHERE matricula = ?`, matricula).Scan(&u.Matricula, &u.PasswordHash, &u.APIKeyEncrypted)
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (a *App) getUserHeaders(ctx context.Context) (map[string]string, error) {
	matricula, _ := ctx.Value("matricula").(string)
	user, err := a.findUserByMatricula(matricula)
	if err != nil {
		return nil, errors.New("usuário autenticado não encontrado")
	}
	if user.APIKeyEncrypted == "" {
		return nil, errors.New("usuário sem API key cadastrada")
	}
	apiKey, err := decryptAPIKey(a.encryptionKey, user.APIKeyEncrypted)
	if err != nil {
		return nil, errors.New("API key inválida")
	}
	return map[string]string{"Authorization": "Bearer " + apiKey, "Accept": "application/json", "Content-Type": "application/json"}, nil
}

func (a *App) snipeJSON(ctx context.Context, method, path string, payload any, headers map[string]string, out any) error {
	var body io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		body = strings.NewReader(string(b))
	}
	url := a.snipeURL + "/" + strings.TrimPrefix(path, "/")
	req, _ := http.NewRequestWithContext(ctx, method, url, body)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("snipe status %d: %s", resp.StatusCode, string(b))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

func (a *App) snipeRaw(ctx context.Context, method, path string, body io.Reader, headers map[string]string) error {
	url := a.snipeURL + "/" + strings.TrimPrefix(path, "/")
	req, _ := http.NewRequestWithContext(ctx, method, url, body)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("snipe status %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func mapAsset(asset map[string]any) map[string]any {
	cf, _ := asset["custom_fields"].(map[string]any)
	var pa any
	if v, ok := cf["PA"].(map[string]any); ok {
		pa = v["value"]
	}
	return map[string]any{
		"id":           asset["id"],
		"assetTag":     asset["asset_tag"],
		"serial":       asset["serial"],
		"name":         asset["name"],
		"status":       nestedString(asset, "status_label", "name"),
		"company":      nestedString(asset, "company", "name"),
		"manufacturer": nestedString(asset, "manufacturer", "name"),
		"location":     nestedString(asset, "location", "name"),
		"notes":        asset["notes"],
		"pa":           pa,
	}
}

func nestedString(m map[string]any, keys ...string) string {
	cur := any(m)
	for _, k := range keys {
		next, ok := cur.(map[string]any)[k]
		if !ok {
			return ""
		}
		cur = next
	}
	if s, ok := cur.(string); ok {
		return s
	}
	return ""
}

func initDB(db *sql.DB) error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		matricula TEXT PRIMARY KEY,
		password_hash TEXT NOT NULL,
		api_key_encrypted TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`)
	return err
}

func encryptAPIKey(secret []byte, plaintext string) (string, error) {
	block, err := aes.NewCipher(secret)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decryptAPIKey(secret []byte, encrypted string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(secret)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ns := gcm.NonceSize()
	if len(data) < ns {
		return "", errors.New("ciphertext inválido")
	}
	plaintext, err := gcm.Open(nil, data[:ns], data[ns:], nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func statusFromErr(err error) int {
	parts := strings.Split(err.Error(), " ")
	if len(parts) >= 3 && parts[0] == "snipe" && parts[1] == "status" {
		if code, convErr := strconv.Atoi(strings.TrimSuffix(parts[2], ":")); convErr == nil {
			return code
		}
	}
	return 500
}

func (a *App) logAuth(action, matricula, result string) {
	line := fmt.Sprintf("%s action=%s matricula=%s result=%s\n", time.Now().Format(time.RFC3339), action, matricula, result)
	_ = os.MkdirAll(filepath.Dir(a.authLogPath), 0o755)
	f, err := os.OpenFile(a.authLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.WriteString(line)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func serveHTML(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, path) }
}

func loadDotEnv(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.TrimSpace(parts[0])
		v := strings.Trim(strings.TrimSpace(parts[1]), `"`)
		if os.Getenv(k) == "" {
			_ = os.Setenv(k, v)
		}
	}
	return nil
}

func env(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}
