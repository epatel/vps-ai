import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _api;
  String? _token;
  String? _email;
  String? _userId;
  bool _isLoading = false;
  String? _error;

  AuthProvider(this._api) {
    _loadToken();
  }

  bool get isAuthenticated => _token != null;
  bool get isLoading => _isLoading;
  String? get email => _email;
  String? get userId => _userId;
  String? get error => _error;

  Future<void> _loadToken() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    _email = prefs.getString('auth_email');
    _userId = prefs.getString('auth_user_id');
    if (_token != null) {
      _api.setToken(_token);
      // Verify token is still valid
      try {
        await _api.getMe();
      } catch (_) {
        await _clearAuth();
      }
    }
    notifyListeners();
  }

  Future<void> _saveAuth(String token, String email, String userId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
    await prefs.setString('auth_email', email);
    await prefs.setString('auth_user_id', userId);
    _token = token;
    _email = email;
    _userId = userId;
    _api.setToken(token);
  }

  Future<void> _clearAuth() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('auth_email');
    await prefs.remove('auth_user_id');
    _token = null;
    _email = null;
    _userId = null;
    _api.setToken(null);
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await _api.login(email, password);
      await _saveAuth(
        result['token'] as String,
        result['email'] as String,
        result['user_id'] as String,
      );
      _isLoading = false;
      notifyListeners();
      return true;
    } on ApiException catch (e) {
      _error = e.message;
      _isLoading = false;
      notifyListeners();
      return false;
    } catch (e) {
      _error = 'Connection error. Please try again.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<String?> signup(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final result = await _api.signup(email, password);
      _isLoading = false;
      notifyListeners();
      return result['message'] as String?;
    } on ApiException catch (e) {
      _error = e.message;
      _isLoading = false;
      notifyListeners();
      return null;
    } catch (e) {
      _error = 'Connection error. Please try again.';
      _isLoading = false;
      notifyListeners();
      return null;
    }
  }

  Future<void> logout() async {
    await _clearAuth();
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
