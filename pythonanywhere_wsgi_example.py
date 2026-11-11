"""
PythonAnywhere WSGI konfiguratsiya namunasi.
PythonAnywhere -> Web -> WSGI configuration file ichiga shunga o'xshash qatorlarni qo'ying
(<username> o'rniga PythonAnywhere foydalanuvchi nomingizni yozing).
"""

import os
import sys

PROJECT_HOME = '/home/<username>/testApp'
if PROJECT_HOME not in sys.path:
    sys.path.insert(0, PROJECT_HOME)

os.environ['DJANGO_SETTINGS_MODULE'] = 'dono_project.settings'
os.environ['DJANGO_DEBUG'] = '0'
# os.environ['DJANGO_SECRET_KEY'] = 'bu-yerga-maxfiy-kalit-yozing'

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
