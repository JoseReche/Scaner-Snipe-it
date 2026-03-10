import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const ScannerSnipeItApp());
}

class ScannerSnipeItApp extends StatelessWidget {
  const ScannerSnipeItApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Scaner Snipe-IT Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _baseUrlController = TextEditingController(text: 'http://10.0.2.2:3000');
  int _tabIndex = 0;

  String get baseUrl => _baseUrlController.text.trim();

  @override
  void dispose() {
    _baseUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      AssetSearchTab(baseUrl: baseUrl),
      MovePaTab(baseUrl: baseUrl),
      CheckoutTab(baseUrl: baseUrl),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Scaner Snipe-IT Mobile'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _baseUrlController,
              decoration: const InputDecoration(
                labelText: 'URL da API',
                hintText: 'http://10.0.2.2:3000',
                border: OutlineInputBorder(),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),
          Expanded(child: pages[_tabIndex]),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (value) => setState(() => _tabIndex = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.search), label: 'Ativo'),
          NavigationDestination(icon: Icon(Icons.swap_horiz), label: 'Mover PA'),
          NavigationDestination(icon: Icon(Icons.assignment_turned_in), label: 'Checkout'),
        ],
      ),
    );
  }
}

class AssetSearchTab extends StatefulWidget {
  const AssetSearchTab({super.key, required this.baseUrl});

  final String baseUrl;

  @override
  State<AssetSearchTab> createState() => _AssetSearchTabState();
}

class _AssetSearchTabState extends State<AssetSearchTab> {
  final _assetIdController = TextEditingController();
  Map<String, dynamic>? _asset;
  String? _error;
  bool _loading = false;

  @override
  void dispose() {
    _assetIdController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final id = _assetIdController.text.trim();
    if (id.isEmpty) return;

    setState(() {
      _loading = true;
      _error = null;
      _asset = null;
    });

    try {
      final response = await http.get(Uri.parse('${widget.baseUrl}/asset/$id'));
      final body = jsonDecode(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        setState(() => _asset = Map<String, dynamic>.from(body));
      } else {
        setState(() => _error = body['error']?.toString() ?? 'Erro ao consultar ativo');
      }
    } catch (e) {
      setState(() => _error = 'Falha de conexão: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _assetIdController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'ID do ativo',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _loading ? null : _search,
            icon: const Icon(Icons.search),
            label: Text(_loading ? 'Consultando...' : 'Consultar ativo'),
          ),
          const SizedBox(height: 16),
          if (_error != null)
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          if (_asset != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _info('Nome', _asset!['name']),
                    _info('Tag', _asset!['assetTag']),
                    _info('Serial', _asset!['serial']),
                    _info('Modelo', _asset!['model']),
                    _info('Status', _asset!['status']),
                    _info('Empresa', _asset!['company']),
                    _info('Local', _asset!['location']),
                    _info('PA', _asset!['pa']),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class MovePaTab extends StatefulWidget {
  const MovePaTab({super.key, required this.baseUrl});

  final String baseUrl;

  @override
  State<MovePaTab> createState() => _MovePaTabState();
}

class _MovePaTabState extends State<MovePaTab> {
  final _assetController = TextEditingController();
  final _paController = TextEditingController();
  String? _message;
  bool _loading = false;

  @override
  void dispose() {
    _assetController.dispose();
    _paController.dispose();
    super.dispose();
  }

  Future<void> _move() async {
    setState(() {
      _loading = true;
      _message = null;
    });

    try {
      final response = await http.post(
        Uri.parse('${widget.baseUrl}/move'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'asset': _assetController.text.trim(),
          'pa': _paController.text.trim(),
        }),
      );

      final body = jsonDecode(response.body);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        setState(() => _message = 'PA atualizado com sucesso.');
      } else {
        setState(() => _message = body['error']?.toString() ?? 'Erro ao mover ativo');
      }
    } catch (e) {
      setState(() => _message = 'Falha de conexão: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _assetController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'ID do ativo', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _paController,
            decoration: const InputDecoration(labelText: 'Novo PA', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _loading ? null : _move,
            icon: const Icon(Icons.swap_horiz),
            label: Text(_loading ? 'Enviando...' : 'Atualizar PA'),
          ),
          const SizedBox(height: 16),
          if (_message != null) Text(_message!),
        ],
      ),
    );
  }
}

class CheckoutTab extends StatefulWidget {
  const CheckoutTab({super.key, required this.baseUrl});

  final String baseUrl;

  @override
  State<CheckoutTab> createState() => _CheckoutTabState();
}

class _CheckoutTabState extends State<CheckoutTab> {
  final _assetController = TextEditingController();
  final _userController = TextEditingController();
  String? _message;
  bool _loading = false;

  @override
  void dispose() {
    _assetController.dispose();
    _userController.dispose();
    super.dispose();
  }

  Future<void> _checkout() async {
    setState(() {
      _loading = true;
      _message = null;
    });

    try {
      final response = await http.post(
        Uri.parse('${widget.baseUrl}/checkout'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'asset': _assetController.text.trim(),
          'user': _userController.text.trim(),
        }),
      );
      final body = jsonDecode(response.body);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        setState(() => _message = 'Checkout realizado com sucesso.');
      } else {
        setState(() => _message = body['error']?.toString() ?? 'Erro no checkout');
      }
    } catch (e) {
      setState(() => _message = 'Falha de conexão: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _assetController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'ID do ativo', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _userController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'ID do usuário', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _loading ? null : _checkout,
            icon: const Icon(Icons.assignment_turned_in),
            label: Text(_loading ? 'Processando...' : 'Fazer checkout'),
          ),
          const SizedBox(height: 16),
          if (_message != null) Text(_message!),
        ],
      ),
    );
  }
}

Widget _info(String label, Object? value) {
  final display = (value == null || value.toString().trim().isEmpty) ? '-' : value.toString();

  return Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text('$label: $display'),
  );
}
