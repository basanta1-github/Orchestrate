FROM node:20-alpine

#set working directory
WORKDIR /app

# Copy shared library into container (so npm can install it)
COPY shared/package*.json ./shared/
#copy only dependency files first (better caching)
COPY api/package*.json ./api/

#Install dependencies ( api and shared symlink)
WORKDIR /app/api
RUN npm install

#copy rest of the source code
COPY shared/. ../shared/
COPY api/. ./

#build shared
# WORKDIR /app/shared 
# this will copy shared as well
# RUN npm run build
# RUN npx nest build
RUN npx tsc

#Expose API port
EXPOSE 3001

#Run compiled app
CMD ["npm", "run", "start:prod"]



