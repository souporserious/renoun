#!/bin/env node

import { writeFile } from 'fs/promises'

writeFile('test.txt', 'Hello World!')
