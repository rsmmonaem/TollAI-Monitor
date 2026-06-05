#!/usr/bin/env python3
# pyrefly: ignore [missing-import]
import mysql.connector
import sys

def test_connection(host, user, password, database=None):
    try:
        config = {
            'host': host,
            'user': user,
            'password': password,
            'port': 3306
        }
        if database:
            config['database'] = database
            
        conn = mysql.connector.connect(**config)
        conn.close()
        return True, "Success"
    except Exception as e:
        return False, str(e)

print("=== MySQL Diagnostic Connection Test ===")
print("Testing various configurations with 'root' user...")
print("-" * 50)

tests = [
    {"host": "localhost", "password": "", "desc": "localhost with empty string password"},
    {"host": "127.0.0.1", "password": "", "desc": "127.0.0.1 with empty string password"},
    {"host": "localhost", "password": None, "desc": "localhost with None password"},
    {"host": "127.0.0.1", "password": None, "desc": "127.0.0.1 with None password"},
]

all_failed = True
for t in tests:
    print(f"Testing: {t['desc']}...")
    success, msg = test_connection(t['host'], 'root', t['password'])
    if success:
        print(f"  --> ✅ CONNECTED successfully!")
        all_failed = False
        # Test if toll_monitoring database exists or can be created
        db_success, db_msg = test_connection(t['host'], 'root', t['password'], 'toll_monitoring')
        if db_success:
            print("  --> ✅ Able to connect to 'toll_monitoring' database.")
        else:
            print(f"  --> ⚠️ Connection succeeded, but 'toll_monitoring' DB test failed: {db_msg}")
    else:
        print(f"  --> ❌ FAILED: {msg}")
    print("-" * 50)

if all_failed:
    print("ALL TESTS FAILED.")
    print("\nSuggestions:")
    print("1. Verify if your MySQL service is actually running: brew services status mysql")
    print("2. Check if your root user requires a password in MySQL.")
    print("3. Try running: mysql -u root -p (leave password blank and press Enter to see if it allows you in)")
else:
    print("Diagnostic completed. Please use the working host/password in your python/ai_engine.py configuration.")
