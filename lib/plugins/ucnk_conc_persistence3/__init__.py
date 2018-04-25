# Copyright (c) 2017 Charles University, Faculty of Arts,
#                    Institute of the Czech National Corpus
# Copyright (c) 2017 Tomas Machalek <tomas.machalek@gmail.com>
# Copyright (c) 2017 Petr Duda <petrduda@seznam.cz>
#
# This program is free software; you can redistribute it and/or
# modify it under the terms of the GNU General Public License
# as published by the Free Software Foundation; version 2
# dated June, 1991.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.

# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.

"""
A modified implementation of default_conc_persistence plug-in which looks into
multiple secondary archives in case a key is not found. It is expected that an external
script archives old/unused/whatever records from the main db to the secondary db(s).

required config.xml entries:

element conc_persistence {
  element module { "ucnk_conc_persistence3" }
  element archive_db_path {
    attribute extension-by { "ucnk" }
    { text } # a path to the archive sqlite3 database files directory (see SQL below)
  }
  element archive_rows_limit {
    attribute extension-by { "ucnk" }
    { text } # the maximum number of rows an archive file can contain before a new archive is created,
    the limit is checked after each run of the archiver, so the actual number of rows may exceed this limit
    by the num_proc argument passed to the archive.run method
    }
}

archive db:

CREATE TABLE archive (
    id text,
    data text NOT NULL,
    created integer NOT NULL,
    num_access integer NOT NULL DEFAULT 0,
    last_access integer,
    PRIMARY KEY (id)
);
"""

import hashlib
import time
import re
import json
import uuid
import archive

import plugins
from archive import ArchMan
from plugins.abstract.conc_persistence import AbstractConcPersistence
from plugins import inject
from controller.errors import ForbiddenException

KEY_ALPHABET = [chr(x) for x in range(ord('a'), ord('z') + 1)] + [chr(x) for x in range(ord('A'), ord('Z') + 1)] + \
               ['%d' % i for i in range(10)]

PERSIST_LEVEL_KEY = 'persist_level'
ID_KEY = 'id'
QUERY_KEY = 'q'
DEFAULT_CONC_ID_LENGTH = 12


def id_exists(id):
    """
    Tests whether passed id exists
    """
    # currently we assume that id (= prefix of md5 hash with 52^6 possible values)
    #  conflicts are very unlikely
    return False


def generate_uniq_id():
    return mk_short_id(uuid.uuid1().hex, min_length=DEFAULT_CONC_ID_LENGTH)


def mk_key(code):
    return 'concordance:%s' % (code,)


def mk_short_id(s, min_length=6):
    """
    Generates a hash based on md5 but using [a-zA-Z0-9] characters and with
    limited length.

    arguments:ucnk_op_persistence
    s -- a string to be hashed
    min_length -- minimum length of the output hash
    """
    x = long('0x' + hashlib.md5(s).hexdigest(), 16)
    ans = []
    while x > 0:
        p = x % len(KEY_ALPHABET)
        ans.append(KEY_ALPHABET[p])
        x /= len(KEY_ALPHABET)
    ans = ''.join([str(x) for x in ans])
    max_length = len(ans)
    i = min_length
    while id_exists(ans[:i]) and i < max_length:
        i += 1
    return ans[:i]


class ConcPersistence(AbstractConcPersistence):
    """
    This class stores user's queries in their internal form (see Kontext.q attribute).
    """

    DEFAULT_TTL_DAYS = 100
    DEFAULT_ANONYMOUS_USER_TTL_DAYS = 7
    DEFAULT_ARCHIVE_ROWS_LIMIT = 1000000

    def __init__(self, settings, db, auth, db_path, ttl_days, anonymous_user_ttl_days, arch_rows_limit):
        self._ttl_days = ttl_days
        self._anonymous_user_ttl_days = anonymous_user_ttl_days
        self._archive_queue_key = archive.ARCHIVE_QUEUE_KEY
        self.db = db
        self._auth = auth
        self._settings = settings  # TO_DO: planned to remove
        self.arch_man = ArchMan(db_path, arch_rows_limit)

    @property
    def ttl(self):
        return self._ttl_days * 24 * 3600

    @property
    def anonymous_user_ttl(self):
        return self._anonymous_user_ttl_days * 24 * 3600

    def _get_ttl_for(self, user_id):
        if self._auth.is_anonymous(user_id):
            return self.anonymous_user_ttl
        return self.ttl

    def _get_persist_level_for(self, user_id):
        if self._auth.is_anonymous(user_id):
            return 0
        else:
            return 1

    def is_valid_id(self, data_id):
        """
        Returns True if data_id is a valid data identifier else False is returned

        arguments:
        data_id -- identifier to be tested
        """
        return bool(re.match(r'~[0-9a-zA-Z]+', data_id))

    def get_conc_ttl_days(self, user_id):
        if self._auth.is_anonymous(user_id):
            return self._anonymous_user_ttl_days
        return self._ttl_days

    @staticmethod
    def _execute_sql(conn, sql, args=()):
        cursor = conn.cursor()
        cursor.execute(sql, args)
        return cursor

    def open(self, data_id):
        """
        Loads operation data according to the passed data_id argument.
        The data are assumed to be public (as are URL parameters of a query).

        arguments:
        data_id -- an unique ID of operation data

        returns:
        a dictionary containing operation data or None if nothing is found
        """
        data = self.db.get(mk_key(data_id))
        if data is None:
            # iterate through opened connections to search for data
            self.arch_man.update_archives()
            for arch_conn in self.arch_man.arch_connections:
                tmp = self._execute_sql(arch_conn, 'SELECT data, num_access FROM archive WHERE id = ?',
                                        (data_id,)).fetchone()
                if tmp:
                    data = json.loads(tmp[0])
                    self._execute_sql(arch_conn,
                                      'UPDATE archive SET last_access = ?, num_access = num_access + 1 WHERE id = ?',
                                      (int(round(time.time())), data_id))
                    arch_conn.commit()
                    break
        return data

    def store(self, user_id, curr_data, prev_data=None):
        """
        Stores current operation (defined in curr_data) into the database. If also prev_data argument is
        provided then a comparison is performed and based on the result, new record is created and new
        ID is returned or nothing is done and current ID is returned.

        arguments:
        user_id -- database ID of the current user
        curr_data -- a dictionary containing operation data to be stored; currently at least 'q' entry must be present
        prev_data -- optional dictionary with previous operation data; again, 'q' entry must be there

        returns:
        new operation ID if a new record is created or current ID if no new operation is defined
        """

        def records_differ(r1, r2):
            return (r1[QUERY_KEY] != r2[QUERY_KEY] or
                    r1.get('lines_groups') != r2.get('lines_groups'))

        if prev_data is None or records_differ(curr_data, prev_data):
            data_id = generate_uniq_id()
            curr_data[ID_KEY] = data_id
            if prev_data is not None:
                curr_data['prev_id'] = prev_data['id']
            curr_data[PERSIST_LEVEL_KEY] = self._get_persist_level_for(user_id)
            data_key = mk_key(data_id)
            self.db.set(data_key, curr_data)
            self.db.set_ttl(data_key, self._get_ttl_for(user_id))
            if not self._auth.is_anonymous(user_id):
                self.db.list_append(self._archive_queue_key, dict(key=data_key))
            latest_id = curr_data[ID_KEY]
        else:
            latest_id = prev_data[ID_KEY]

        return latest_id

    def archive(self, user_id, conc_id, revoke=False):
        data = self.db.get(mk_key(conc_id))
        stored_user_id = data.get('user_id', None)
        if user_id != stored_user_id:
            raise ForbiddenException(
                'Cannot change status of a concordance belonging to another user')
        pass  # we don't have to do anything here as we archive all the queries by default

    def is_archived(self, conc_id):
        return True  # we ignore archiver task delay and say "True" for all the items

    def export_tasks(self):
        """
        Export tasks for Celery worker(s)
        """

        def archive_concordance(num_proc, dry_run):
            return archive.run(conf=self._settings, num_proc=num_proc, dry_run=dry_run)

        return archive_concordance,


@inject(plugins.runtime.DB, plugins.runtime.AUTH)
def create_instance(settings, db, auth):
    """
    Creates a plugin instance.
    """
    db_path = settings.get('plugins')['conc_persistence']['ucnk:archive_db_path']
    plugin_conf = settings.get('plugins', 'conc_persistence')
    ttl_days = int(plugin_conf.get('default:ttl_days', ConcPersistence.DEFAULT_TTL_DAYS))
    anonymous_user_ttl_days = int(
        plugin_conf.get('default:anonymous_user_ttl_days', ConcPersistence.DEFAULT_ANONYMOUS_USER_TTL_DAYS))
    arch_rows_limit = int(plugin_conf.get('ucnk:archive_rows_limit',
                                          ConcPersistence.DEFAULT_ARCHIVE_ROWS_LIMIT))
    return ConcPersistence(settings, db, auth, db_path, ttl_days, anonymous_user_ttl_days, arch_rows_limit)
