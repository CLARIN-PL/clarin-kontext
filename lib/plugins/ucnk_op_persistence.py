# Copyright (c) 2014 Institute of the Czech National Corpus
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

required table:

CREATE TABLE kontext_operations (
  id varchar(63) NOT NULL,
  user_id int(11) NOT NULL,
  data text,
  created double NOT NULL,
  permanent INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY user_id (user_id),
  CONSTRAINT kontext_operations_ibfk_1 FOREIGN KEY (user_id) REFERENCES user (id)
) DEFAULT CHARSET=utf8
"""

import hashlib
import json
import time
import re


def id_exists(id):
    """
    Tests whether passed id exists
    """
    # currently we assume that id (= prefix of md5 hash with 52^6 possible values)
    #  conflicts are very unlikely
    return False


def mk_short_id(s, min_length=6):
    """
    Generates a hash based on md5 but using [a-zA-Z0-9] characters and with
    limited length.

    arguments:
    s -- a string to be hashed
    min_length -- minimum length of the output hash
    """
    chars = (
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'
    )
    x = long('0x' + hashlib.md5(s).hexdigest(), 16)
    ans = []
    while x > 0:
        p = x % len(chars)
        ans.append(chars[p])
        x /= len(chars)
    ans = ''.join([str(x) for x in ans])
    max_length = len(ans)
    i = min_length
    while id_exists(ans[:i]) and i < max_length:
        i += 1
    return ans[:i]


class OperationPersistence(object):
    """
    This class stores user's queries in their internal form (see conccgi.q attribute).
    """

    def __init__(self, db_provider):
        self.db_provider = db_provider

    def is_valid_id(self, data_id):
        return bool(re.match(r'~[0-9a-zA-Z]+', data_id))

    def open(self, data_id):
        """
        Loads operation data according to the passed data_id argument.
        The data are assumed to be public (as are URL parameters of a query).

        arguments:
        data_id -- an unique ID of operation data

        returns:
        a dictionary containing operation data or None if nothing is found
        """
        db = self.db_provider()
        # note: we can ask for user_id too but all the codes are public
        ans = db.execute("SELECT data FROM kontext_operations WHERE id = %s", (data_id, )).fetchone()
        db.close()
        if ans is not None:
            return json.loads(ans[0])
        return None

    def store(self, user_id, curr_data, prev_data=None):
        """
        Stores current operation (defined in curr_data) into the database. If also prev_date argument is
        provided then a comparison is performed and based on the result, new record is created and new
        ID is returned on nothing is done and current ID is returned.

        arguments:
        user_id -- database ID of the current user
        curr_data -- a dictionary containing operation data to be stored; currently at least 'q' entry must be present
        prev_data -- optional dictionary with previous operation data; again, 'q' entry must be there

        returns:
        new operation ID if a new record is created or current ID if no new operation is defined
        """
        if prev_data is None or curr_data['q'] != prev_data['q']:

            time_created = time.time()
            data_id = mk_short_id('%s' % time_created)
            curr_data['id'] = data_id
            json_data = json.dumps(curr_data)

            db = self.db_provider()
            db.execute("INSERT INTO kontext_operations (id, user_id, data, created) VALUES (%s, %s, %s, %s)",
                       (data_id, user_id, json_data, time_created))
            db.close()
            latest_id = curr_data['id']
        else:
            latest_id = prev_data['id']

        return latest_id


def create_instance(settings, db_provider):
    return OperationPersistence(db_provider)