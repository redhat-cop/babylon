import secrets
import string

def random_string(length):
    return ''.join([secrets.choice(string.ascii_letters + string.digits) for n in range(length)])
